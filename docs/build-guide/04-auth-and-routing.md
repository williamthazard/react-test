# Part 4: Authentication and Routing

The application uses a simple state-based router in `App.tsx`. The `AccessCodeWall` component is the gatekeeper — it verifies the code, receives the preloaded test data from the server in the same response, and hands everything up to `App.tsx`, which then decides which view to render.

## 1. Access Code Wall (`AccessCodeWall.tsx`)

Create `src/components/AccessCodeWall.tsx`. This component is responsible for:
1. Firing a background "warm-up" call to reduce cold-start latency
2. Accepting the user's access code and submitting it to the `verify-access-code` function
3. Retrying automatically on timeout
4. Parsing the server's response — which includes the preloaded questions — and passing it up to the parent

### Imports and Props Interface

```tsx
import { useState, useEffect, type FormEvent } from 'react';
import { ExecutionMethod } from 'appwrite';
import { functions, VERIFY_FUNCTION_ID } from '../services/appwrite';
import { type TestDataPayload } from '../data/questionsData';

interface AccessCodeWallProps {
    onUnlock: (role: 'student' | 'editor', code: string, payload: TestDataPayload | null) => void;
}
```

The `onUnlock` callback receives three things: the user's role (`'student'` or `'editor'`), the raw access code string (needed later for saving/sending), and the full `TestDataPayload` the server sent back during authentication. Passing the payload up here is what allows `App.tsx` to skip loading screens entirely when the downstream views mount.

### State Variables

```tsx
export default function AccessCodeWall({ onUnlock }: AccessCodeWallProps) {
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [shake, setShake] = useState(false);
    const [checking, setChecking] = useState(false);
```

- `code` — the raw value of the input field
- `error` — a user-facing error string shown below the input
- `shake` — triggers the CSS shake animation on invalid attempts
- `checking` — disables the form while a network request is in flight

### Cold-Start Warm-Up

```tsx
    // Fire an async (background) call immediately on mount.
    // Appwrite serverless functions "sleep" when idle and take 1–3 seconds to
    // cold-start. By sending a harmless request as soon as the page loads,
    // the container is usually warm by the time the user actually submits.
    useEffect(() => {
        functions.createExecution(
            VERIFY_FUNCTION_ID,
            JSON.stringify({ code: 'WARM_UP' }),
            true, // async — we don't wait for or care about the response
            undefined,
            ExecutionMethod.POST,
        ).catch(() => { }); // swallow any error; this is fire-and-forget
    }, []);
```

This `useEffect` runs once on mount. The `true` flag (the third argument to `createExecution`) tells Appwrite to run the execution asynchronously — we don't wait for a response. The empty `.catch` silences any network errors since this call is purely a performance hint.

### Submit Handler with Retry Logic

```tsx
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!code.trim() || checking) return;

        setChecking(true);
        setError('');

        let retryCount = 0;
        const maxRetries = 3;
        let success = false;
        let valid = false;
        let role: 'student' | 'editor' = 'student';
        let preloadedPayload: TestDataPayload | null = null;

        while (retryCount < maxRetries && !success) {
            try {
                const result = await functions.createExecution(
                    VERIFY_FUNCTION_ID,
                    JSON.stringify({ code: code.trim() }),
                    false, // synchronous — we need the response
                    undefined,
                    ExecutionMethod.POST,
                );

                if (result.status === 'failed') {
                    throw new Error('Appwrite execution failed (cold start timeout)');
                }

                if (result.responseBody) {
                    const parsed = JSON.parse(result.responseBody);
                    valid = parsed.valid === true;
                    if (parsed.role) role = parsed.role;

                    // The server sends back questions piggybacked on the auth response.
                    // We support two historical formats:
                    // - Old format: parsed.questions is a raw Question[] array
                    // - New format: parsed.questions is a { settings, questions } object
                    if (parsed.questions) {
                        if (Array.isArray(parsed.questions)) {
                            preloadedPayload = { settings: {}, questions: parsed.questions };
                        } else if (parsed.questions.questions) {
                            preloadedPayload = parsed.questions;
                        }
                    }

                    success = true;
                } else {
                    throw new Error('Empty response body');
                }
            } catch (err) {
                retryCount++;
                if (retryCount >= maxRetries) {
                    setError('Unable to verify. Please try again.');
                    setShake(true);
                    setTimeout(() => setShake(false), 500);
                    setChecking(false);
                    return;
                }
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        if (success) {
            if (valid) {
                onUnlock(role, code, preloadedPayload);
            } else {
                setError('Invalid access code. Please try again.');
                setShake(true);
                setTimeout(() => setShake(false), 500);
            }
        }
        setChecking(false);
    };
```

The retry loop is important. Even with the warm-up call, Appwrite functions can time out on a cold start. The loop gives us three chances before showing an error to the user.

Note that the body sent to the function is simply `{ code: code.trim() }` — no `action` field. The `verify-access-code` backend function (Part 2) treats any request without an explicit action as a code verification request and automatically preloads the questions on success.

### Return / JSX

```tsx
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a2a4a] via-[#253d6e] to-[#1e3058] px-4 relative overflow-hidden">
            {/* Top yellow accent bar */}
            <div className="absolute top-0 left-0 w-full h-1.5 bg-pit-yellow z-20" />

            {/* Decorative blurred orbs for depth */}
            <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-[#3161AC]/30 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#3161AC]/20 rounded-full blur-3xl" />
            <div className="absolute top-1/2 right-1/3 w-48 h-48 bg-[#F7CC07]/10 rounded-full blur-3xl" />
            <div className="absolute bottom-1/3 left-1/3 w-64 h-64 bg-[#2050a0]/25 rounded-full blur-3xl" />

            {/* Card — animate-shake fires when shake state is true */}
            <div
                className={`relative z-10 w-full max-w-md p-8 rounded-2xl border border-white/15 bg-white/10 backdrop-blur-xl shadow-2xl transition-transform ${shake ? 'animate-shake' : ''}`}
            >
                {/* PIT Logo */}
                <div className="flex justify-center mb-6">
                    <img
                        src={`${import.meta.env.BASE_URL}PIT_logo_blue.png`}
                        alt="Pennsylvania Institute of Technology"
                        className="w-28 h-28 object-contain drop-shadow-lg"
                        style={{ filter: 'brightness(0) invert(1)' }}
                    />
                </div>

                <h1 className="text-2xl font-bold text-center text-white font-heading tracking-tight">
                    Access Code Required
                </h1>
                <p className="text-sm text-center text-blue-200/70 mb-8 mt-2">
                    Enter the access code to view the test
                </p>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => {
                                setCode(e.target.value);
                                if (error) setError('');
                            }}
                            placeholder="Enter access code"
                            autoFocus
                            disabled={checking}
                            className="w-full px-4 py-3 rounded-xl bg-white/8 border border-white/15 text-white placeholder-blue-200/40 text-center text-lg tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-[#F7CC07]/50 focus:border-[#F7CC07]/50 transition-all disabled:opacity-50"
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-rose-300 text-center animate-fade-in">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={checking}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-[#3161AC] to-[#4a7fd4] text-white font-semibold tracking-wide shadow-lg shadow-[#3161AC]/30 hover:shadow-[#3161AC]/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        {checking ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                                    <path d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" fill="currentColor" className="opacity-75" />
                                </svg>
                                Verifying…
                            </span>
                        ) : (
                            'Unlock Test'
                        )}
                    </button>
                </form>

                <div className="mt-6 flex justify-center">
                    <div className="h-1 w-16 rounded-full bg-[#F7CC07]/60" />
                </div>
            </div>
        </div>
    );
}
```

A few design notes worth explaining:
- **The spinning SVG**: Rather than using an Ionicons icon for the loading state here, we use an inline SVG with `animate-spin` (a built-in Tailwind utility). This is intentional — at the moment the spinner appears, we haven't yet confirmed the user is authorized, so we avoid any dependency on our icon setup being fully loaded.
- **`import.meta.env.BASE_URL`**: Vite injects this at build time. It ensures the logo path works correctly both in development (where it's `/`) and in subdirectory deployments like GitHub Pages (where it may be `/repo-name/`).

## 2. Global Routing (`App.tsx`)

`App.tsx` is the root of the application. Its only job is to hold authentication state and decide which top-level view to render.

```tsx
import { useState } from 'react';
import AccessCodeWall from './components/AccessCodeWall';
import TestPage from './components/TestPage';
import TestEditor from './components/TestEditor';
import { type TestDataPayload } from './data/questionsData';

// AuthState is null when the user hasn't authenticated yet.
// Once authenticated, it holds the role, the raw access code, and the full
// preloaded payload (settings + questions) returned by the server.
type AuthState = { role: 'student' | 'editor'; code: string; payload: TestDataPayload | null } | null;

function App() {
  const [auth, setAuth] = useState<AuthState>(null);

  // No auth → show the lock screen
  if (!auth) {
    return <AccessCodeWall onUnlock={(role, code, payload) => setAuth({ role, code, payload })} />;
  }

  // Auth confirmed → pass the preloaded payload straight to the correct view.
  // Because the payload was fetched during authentication, neither TestEditor
  // nor TestPage needs to show a loading screen or make an additional API call.
  return auth.role === 'editor'
    ? <TestEditor code={auth.code} initialPayload={auth.payload} />
    : <TestPage code={auth.code} initialPayload={auth.payload} />;
}

export default App;
```

The key insight here is that `auth.payload` carries the full `TestDataPayload` — both the `settings` object and the `questions` array — directly from the authentication response. When `TestEditor` or `TestPage` receive this as `initialPayload`, they skip their own network fetches entirely and render immediately.
