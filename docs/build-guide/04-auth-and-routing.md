# Part 4: Authentication and Routing

The application uses a simple boolean state router in `App.tsx` guarded by the `AccessCodeWall`.

## 1. Access Code Wall

Create `src/components/AccessCodeWall.tsx`. This component handles the input field, the glassmorphism UI, shake animations for invalid codes, and crucially — it captures the `preloadedQuestions` returned by the server on a successful authentication.

```tsx
import { useState, type FormEvent } from 'react';
import { ExecutionMethod } from 'appwrite';
import { functions, VERIFY_FUNCTION_ID } from '../services/appwrite';
import { type Question } from '../data/questionsData';

interface AccessCodeWallProps {
    onUnlock: (role: 'student' | 'editor', code: string, questions: Question[] | null) => void;
}

export default function AccessCodeWall({ onUnlock }: AccessCodeWallProps) {
    const [code, setCode] = useState('');
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState('');
    const [shake, setShake] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setChecking(true);

        const maxRetries = 3;
        let retryCount = 0;
        let success = false;
        let valid = false;
        let role: 'student' | 'editor' = 'student';
        let preloadedQuestions: Question[] | null = null;

        // Smart retry loop to handle function cold starts
        while (retryCount < maxRetries && !success) {
            try {
                const result = await functions.createExecution(
                    VERIFY_FUNCTION_ID,
                    JSON.stringify({ code: code.trim(), action: 'verify-code' }),
                    false, 
                    undefined,
                    ExecutionMethod.POST,
                );

                if (result.status === 'failed') throw new Error('Cold start timeout');

                if (result.responseBody) {
                    const parsed = JSON.parse(result.responseBody);
                    valid = parsed.valid === true;
                    if (parsed.role) role = parsed.role;
                    preloadedQuestions = parsed.questions || null;
                    success = true;
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
                // Pass the preloaded questions up to the root
                onUnlock(role, code, preloadedQuestions);
            } else {
                setError('Invalid access code. Please try again.');
                setShake(true);
                setTimeout(() => setShake(false), 500);
            }
        }
        setChecking(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#e8edf5] via-[#dde4f0] to-[#d0d9eb] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background design elements... */}
            <div className={`relative z-10 w-full max-w-md ${shake ? 'animate-shake' : ''}`}>
                <div className="bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl p-8 shadow-[0_8px_32px_rgba(49,97,172,0.1)]">
                    <h2 className="text-2xl font-heading font-bold text-pit-blue mb-6">Assessment Access</h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            placeholder="Enter Access Code"
                            className="w-full px-5 py-4 rounded-xl bg-white/70 border border-white/60 text-pit-grey placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F7CC07]/50 focus:border-[#F7CC07]/50 transition-all font-mono tracking-wider text-center text-lg"
                            disabled={checking}
                            autoFocus
                        />
                        {error && <p className="text-red-500 text-sm text-center font-medium animate-fade-in">{error}</p>}
                        <button
                            type="submit"
                            disabled={!code.trim() || checking}
                            className="w-full py-4 px-6 rounded-xl bg-pit-yellow text-pit-yellow-dark font-bold text-lg hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {checking ? 'Verifying...' : 'Unlock Test'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
```

## 2. Global Routing (`App.tsx`)

`App.tsx` stores the `AuthState` (role, code, and the questions array). Once set, it renders either the `TestEditor` or `TestPage` and passes down the preloaded questions, effectively eliminating the need for those components to display loading screens or make additional API calls.

```tsx
import { useState } from 'react';
import AccessCodeWall from './components/AccessCodeWall';
import TestPage from './components/TestPage';
import TestEditor from './components/TestEditor';

type AuthState = { role: 'student' | 'editor'; code: string; questions: any[] | null } | null;

function App() {
  const [auth, setAuth] = useState<AuthState>(null);

  if (!auth) {
    return <AccessCodeWall onUnlock={(role, code, questions) => setAuth({ role, code, questions })} />;
  }

  // Preloaded data is passed straight into the views
  return auth.role === 'editor'
    ? <TestEditor code={auth.code} initialQuestions={auth.questions} />
    : <TestPage code={auth.code} initialQuestions={auth.questions} />;
}

export default App;
```
