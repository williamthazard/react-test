# Part 6: Student Mode (`TestPage.tsx`)

The `TestPage` component renders the full interactive test for students. It receives the preloaded `initialPayload` passed down from `App.tsx`, applies any randomization the editor configured, and then renders each question in order. When the student submits, it packages their answers and sends them via the email service built in Part 3.

This document walks through the complete `TestPage.tsx` file from top to bottom.

## Imports and Type Definitions

```tsx
import { useState, useEffect } from 'react';
import { loadQuestions, type Question, type MultipleChoiceQuestion, type MultipleAnswerQuestion, type TestDataPayload } from '../data/questionsData';
import { sendResults } from '../services/emailService';
```

We import `loadQuestions` even though the happy path never calls it — it's needed for the fallback case when `initialPayload` is absent (e.g., if the user does a hard refresh after authentication). We import the specific question subtypes (`MultipleChoiceQuestion`, `MultipleAnswerQuestion`) because they have different fields (`correctIndex` vs `correctIndices`, `options` arrays) that TypeScript needs to know about for safe access.

```tsx
type Answers = Record<number, string | string[]>;
```

`Answers` maps a question ID to its answer. Multiple choice and essay questions store a single `string`; multiple answer questions store a `string[]` (one entry per selected option). Using the question's `id` as the key (rather than its index in the array) means the map stays correct even if questions are reordered or randomized.

```tsx
type SubmitState = 'idle' | 'sending' | 'success' | 'error';
```

`SubmitState` represents the lifecycle of the submission action. It drives which UI is shown in the submit area and, in the `'success'` case, replaces the entire page.

## Component Signature and State

```tsx
export default function TestPage({ code, initialPayload }: { code: string; initialPayload?: TestDataPayload | null }) {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [answers, setAnswers] = useState<Answers>({});
    const [submitState, setSubmitState] = useState<SubmitState>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [nameError, setNameError] = useState(false);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
```

- `firstName` / `lastName` — the student's name, required before submission
- `answers` — the `Answers` map, starts empty and fills as the student works through the test
- `submitState` — drives the submit button label and whether to show the success or error screen
- `errorMsg` — the specific error string shown if submission fails
- `nameError` — a boolean flag that triggers red-border validation styling on the name fields
- `questions` — the final, possibly-randomized array that gets rendered
- `loading` / `loadError` — guard states for the rare case where questions have to be fetched
- `lightboxSrc` — when set, renders the full-screen image lightbox modal

## Loading and Randomization

```tsx
    // processPayload applies any shuffle settings from the editor, then stores
    // the final question array in state. It's called either from the useEffect
    // (with the preloaded payload) or from doLoad (with a freshly fetched payload).
    const processPayload = (payload: TestDataPayload) => {
        let processed = [...payload.questions];

        // 1. Global question order shuffle
        if (payload.settings?.randomizeQuestions) {
            processed.sort(() => Math.random() - 0.5);
        }

        // 2. Per-question option order shuffle
        processed = processed.map(q => {
            if (q.type !== 'essay' && (q as MultipleChoiceQuestion | MultipleAnswerQuestion).randomizeOptions) {
                const qWithOpts = { ...q } as MultipleChoiceQuestion | MultipleAnswerQuestion;
                qWithOpts.options = [...qWithOpts.options].sort(() => Math.random() - 0.5);
                return qWithOpts;
            }
            return q;
        });

        setQuestions(processed);
        setLoading(false);
    };

    // doLoad is the fallback path. It re-fetches questions from the server
    // using the stored access code. This runs when initialPayload is absent
    // (e.g., after a hard page refresh) and is also called by the Retry button
    // on the load-error screen.
    const doLoad = () => {
        setLoading(true);
        setLoadError(false);
        loadQuestions(code)
            .then(processPayload)
            .catch(() => {
                setLoadError(true);
                setLoading(false);
            });
    };

    useEffect(() => {
        if (initialPayload) {
            processPayload(initialPayload);
        } else {
            doLoad();
        }
    }, [initialPayload, code]);
```

The randomization is applied client-side using JavaScript's `Array.sort` with a random comparator. This is a simple and effective approach — the randomization happens in the browser, not on the server, so each student gets a different question order without any extra backend logic.

## Answer Handlers

These three handlers cover all question types. They all follow the same pattern: update the `answers` map immutably using the functional form of `setAnswers`.

```tsx
    // Multiple choice: replaces the single answer for this question
    const handleSelect = (questionId: number, value: string) => {
        setAnswers((prev) => ({ ...prev, [questionId]: value }));
    };

    // Essay: replaces the full text string for this question
    const handleEssay = (questionId: number, value: string) => {
        setAnswers((prev) => ({ ...prev, [questionId]: value }));
    };

    // Multiple answer: toggles a single option within the string[] for this question
    const handleMultiSelect = (questionId: number, option: string) => {
        setAnswers((prev) => {
            const current = (prev[questionId] as string[]) || [];
            if (current.includes(option)) {
                return { ...prev, [questionId]: current.filter((o) => o !== option) };
            }
            return { ...prev, [questionId]: [...current, option] };
        });
    };
```

`handleMultiSelect` uses the functional updater form of `setAnswers` (passing a callback rather than a value) because it reads from the previous state. This is important — if you referenced the `answers` variable directly, you could get a stale value in fast-update scenarios.

## Progress Tracking and Derived State

```tsx
    // Count how many questions the student has actually answered.
    // An answer "counts" if it's a non-empty string or a non-empty array.
    const answeredCount = Object.keys(answers).filter((k) => {
        const a = answers[Number(k)];
        if (Array.isArray(a)) return a.length > 0;
        return typeof a === 'string' && a.trim() !== '';
    }).length;

    const progress = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;
    const hasName = firstName.trim() !== '' && lastName.trim() !== '';
```

These are "derived state" — values calculated from existing state rather than stored separately. `progress` (0–100) drives the width of the progress bar in the sticky header. `hasName` gates submission.

## Submit Handler

```tsx
    const handleSubmit = async () => {
        if (!hasName) {
            setNameError(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        setNameError(false);
        setSubmitState('sending');
        setErrorMsg('');
        try {
            const studentName = `${firstName.trim()} ${lastName.trim()}`;
            await sendResults(answers, studentName, code);
            setSubmitState('success');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            console.error('Failed to send results:', err);
            setErrorMsg('Failed to send results. Please try again.');
            setSubmitState('error');
        }
    };
```

`sendResults` (from Part 3) formats the answers, loads the correct answers from the server to grade them, and sends the report to the configured recipient emails. On success, `submitState` becomes `'success'`, which triggers the early return below that replaces the whole test with a confirmation screen.

## Early Returns

Before the main render, we handle three special states with early returns. Early returns are a clean React pattern — instead of wrapping everything in conditionals inside a single return, we exit the function early and render a completely different UI.

**Loading screen** — shown while `doLoad` is in progress:
```tsx
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#e8edf5] via-[#dde4f0] to-[#d0d9eb]">
                <div className="text-pit-blue text-lg font-semibold animate-pulse">Loading questions…</div>
            </div>
        );
    }
```

**Load error screen** — shown when all retries fail. The Retry button calls `doLoad` directly:
```tsx
    if (loadError) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#e8edf5] via-[#dde4f0] to-[#d0d9eb]">
                <div className="text-center p-8 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/40 shadow-xl max-w-md">
                    <p className="text-pit-grey font-semibold mb-3">Failed to load questions</p>
                    <p className="text-sm text-gray-500 mb-5">The server may be warming up. Please try again.</p>
                    <button onClick={doLoad} className="px-6 py-2.5 rounded-xl bg-pit-blue text-white font-semibold shadow-md hover:shadow-lg transition-all">
                        Retry
                    </button>
                </div>
            </div>
        );
    }
```

**Success screen** — replaces the entire test after successful submission. This is where the `ion-icon` checkmark appears:
```tsx
    if (submitState === 'success') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#e8edf5] via-[#dde4f0] to-[#d0d9eb] px-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-pit-yellow" />

                {/* Decorative blurred orbs */}
                <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#3161AC]/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-24 -left-20 w-80 h-80 bg-[#F7CC07]/10 rounded-full blur-3xl" />

                <div className="relative z-10 text-center p-10 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/40 shadow-xl max-w-lg">
                    <div className="flex justify-center mb-6">
                        <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
                            <ion-icon name="checkmark-outline" className="w-10 h-10 text-white" />
                        </div>
                    </div>
                    <h2 className="text-3xl font-bold text-pit-grey font-heading tracking-tight mb-3">Test Submitted</h2>
                    <p className="text-pit-grey-light text-lg">
                        Thank you, <span className="text-pit-blue font-semibold">{firstName} {lastName}</span>.
                    </p>
                    <p className="text-pit-grey-light mt-2">
                        You answered <span className="text-pit-blue font-semibold">{answeredCount}</span> of{' '}
                        <span className="text-pit-blue font-semibold">{questions.length}</span> questions.
                    </p>
                    <p className="text-pit-grey-light mt-4 text-sm">Your responses have been emailed for review.</p>
                    <div className="mt-6 flex justify-center">
                        <div className="h-1 w-16 rounded-full bg-pit-yellow" />
                    </div>
                </div>
            </div>
        );
    }
```

Note that `firstName`, `lastName`, `answeredCount`, and `questions.length` are still accessible here even though we're in an early return — they're all in the component's closure.

## Main Render

The rest of the component is the main test UI. We use an unusual pattern here: the main page is assigned to a `const page` variable rather than returned directly. This allows us to render the `lightboxSrc` modal *alongside* the page in the final return, outside of the page's JSX tree. Without this, the lightbox would be trapped inside the page's scroll container.

### The `page` variable

```tsx
    const page = (
        <div className="min-h-screen bg-gradient-to-br from-[#e8edf5] via-[#dde4f0] to-[#d0d9eb] relative">
            {/* Top yellow accent bar */}
            <div className="fixed top-0 left-0 w-full h-1.5 bg-pit-yellow z-60" />

            {/* Decorative blurred orbs for glassmorphism background */}
            <div className="fixed top-20 left-10 w-96 h-96 bg-[#3161AC]/10 rounded-full blur-3xl pointer-events-none" />
            <div className="fixed bottom-20 right-10 w-80 h-80 bg-[#F7CC07]/10 rounded-full blur-3xl pointer-events-none" />

            {/* Sticky header with progress bar */}
            <header className="sticky top-0 z-50 border-b border-white/20 bg-pit-blue/90 backdrop-blur-md shadow-md">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img
                            src={`${import.meta.env.BASE_URL}PIT_logo_blue.png`}
                            alt="PIT"
                            className="w-10 h-10 object-contain drop-shadow-md"
                            style={{ filter: 'brightness(0) invert(1)' }}
                        />
                        <div>
                            <h1 className="text-xl font-bold text-white font-heading tracking-tight">Assessment Test</h1>
                            <p className="text-xs text-blue-200 mt-0.5">{questions.length} questions</p>
                        </div>
                    </div>
                    {/* Progress counter and bar */}
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <span className="text-sm font-semibold text-white">{answeredCount}/{questions.length}</span>
                            <p className="text-xs text-blue-200">answered</p>
                        </div>
                        <div className="w-24 h-2 rounded-full bg-white/20 overflow-hidden">
                            <div
                                className="h-full rounded-full bg-pit-yellow transition-all duration-500 ease-out"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                </div>
            </header>

            <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
```

### Name Fields

The student information card appears first. It uses `ion-icon name="person-outline"` as a visual label. If the student tries to submit without filling these in, `nameError` becomes true and the card gets a red border ring:

```tsx
                {/* Student name fields — required before submission */}
                <div className={`p-6 rounded-2xl border bg-white/40 backdrop-blur-xl shadow-sm transition-all duration-300 ${nameError ? 'border-red-400 ring-2 ring-red-200' : 'border-white/40'}`}>
                    <div className="flex items-center gap-3 mb-4">
                        <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-pit-blue text-white">
                            <ion-icon name="person-outline" className="w-4 h-4" />
                        </span>
                        <h2 className="text-pit-grey font-semibold">Student Information</h2>
                        <span className="text-xs text-red-500 font-medium">Required</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-pit-grey-light mb-1.5">First Name</label>
                            <input
                                type="text"
                                value={firstName}
                                onChange={(e) => {
                                    setFirstName(e.target.value);
                                    if (nameError) setNameError(false); // clear the error as they type
                                }}
                                placeholder="Enter first name"
                                className={`w-full px-4 py-3 rounded-xl bg-white/50 border text-pit-grey placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-pit-blue/30 focus:border-pit-blue transition-all ${nameError && !firstName.trim() ? 'border-red-400' : 'border-white/50'}`}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-pit-grey-light mb-1.5">Last Name</label>
                            <input
                                type="text"
                                value={lastName}
                                onChange={(e) => {
                                    setLastName(e.target.value);
                                    if (nameError) setNameError(false);
                                }}
                                placeholder="Enter last name"
                                className={`w-full px-4 py-3 rounded-xl bg-white/50 border text-pit-grey placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-pit-blue/30 focus:border-pit-blue transition-all ${nameError && !lastName.trim() ? 'border-red-400' : 'border-white/50'}`}
                            />
                        </div>
                    </div>
                    {nameError && (
                        <p className="text-sm text-red-500 mt-3 animate-fade-in">Please enter both your first and last name before submitting.</p>
                    )}
                </div>
```

### Question Render Loop

Each question is rendered by the same `.map()` call. The outer card is identical for all types; the inner input section branches based on `q.type`:

```tsx
                {questions.map((q: Question) => (
                    <div
                        key={q.id}
                        className="p-6 rounded-2xl border border-white/40 bg-white/40 backdrop-blur-xl shadow-sm hover:shadow-md hover:bg-white/50 transition-all duration-300"
                    >
                        {/* Question header: numbered badge + type pill */}
                        <div className="flex items-start gap-3 mb-4">
                            <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-pit-blue text-white text-sm font-bold">
                                {q.id}
                            </span>
                            <span
                                className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${
                                    q.type === 'essay'
                                        ? 'bg-pit-yellow/30 text-pit-yellow-dark'
                                        : q.type === 'multiple-answer'
                                        ? 'bg-pit-yellow/20 text-pit-yellow-dark'
                                        : 'bg-pit-blue/10 text-pit-blue'
                                }`}
                            >
                                {q.type === 'multiple-choice' ? 'Multiple Choice' : q.type === 'multiple-answer' ? 'Multiple Answer' : 'Essay'}
                            </span>
                        </div>

                        {/* Prompt text */}
                        <p className="text-pit-grey leading-relaxed mb-5 text-[15px]">{q.prompt}</p>

                        {/* Optional image — clicking opens the lightbox */}
                        {q.imageUrl && (
                            <img
                                src={q.imageUrl}
                                alt="Question image"
                                onClick={() => setLightboxSrc(q.imageUrl!)}
                                className="mb-5 max-w-full max-h-80 rounded-xl border border-white/40 shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all duration-200"
                            />
                        )}

                        {/* Answer input — branches by question type */}
                        {q.type === 'multiple-choice' ? (
                            <div className="space-y-2.5">
                                {q.options.map((opt, idx) => {
                                    const letter = String.fromCharCode(65 + idx); // A, B, C…
                                    const isSelected = answers[q.id] === opt;
                                    return (
                                        <label
                                            key={idx}
                                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                                                isSelected
                                                    ? 'border-pit-blue bg-pit-blue/5 shadow-sm'
                                                    : 'border-white/50 bg-white/50 hover:border-white/80 hover:bg-white/60'
                                            }`}
                                        >
                                            {/* Hidden native radio — the label wraps it so the whole row is clickable */}
                                            <input
                                                type="radio"
                                                name={`q-${q.id}`}
                                                value={opt}
                                                checked={isSelected}
                                                onChange={() => handleSelect(q.id, opt)}
                                                className="sr-only"
                                            />
                                            <span
                                                className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
                                                    isSelected ? 'bg-pit-blue text-white' : 'bg-gray-100 text-pit-grey-light'
                                                }`}
                                            >
                                                {letter}
                                            </span>
                                            <span className={`text-sm ${isSelected ? 'text-pit-blue font-medium' : 'text-pit-grey'}`}>
                                                {opt}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        ) : q.type === 'multiple-answer' ? (
                            <div className="space-y-2.5">
                                <p className="text-xs text-pit-grey-light italic mb-1">Select all that apply</p>
                                {(q as MultipleAnswerQuestion).options.map((opt, idx) => {
                                    const letter = String.fromCharCode(65 + idx);
                                    const selected = ((answers[q.id] as string[]) || []);
                                    const isSelected = selected.includes(opt);
                                    return (
                                        <label
                                            key={idx}
                                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                                                isSelected
                                                    ? 'border-pit-yellow bg-pit-yellow/10 shadow-sm'
                                                    : 'border-white/50 bg-white/50 hover:border-white/80 hover:bg-white/60'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleMultiSelect(q.id, opt)}
                                                className="sr-only"
                                            />
                                            <span
                                                className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
                                                    isSelected ? 'bg-pit-yellow text-pit-blue' : 'bg-gray-100 text-pit-grey-light'
                                                }`}
                                            >
                                                {isSelected ? '✓' : letter}
                                            </span>
                                            <span className={`text-sm ${isSelected ? 'text-pit-blue font-medium' : 'text-pit-grey'}`}>
                                                {opt}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        ) : (
                            // Essay
                            <textarea
                                rows={4}
                                placeholder="Type your answer here…"
                                value={(answers[q.id] as string) || ''}
                                onChange={(e) => handleEssay(q.id, e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white/50 border border-white/50 text-pit-grey placeholder-gray-400 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-pit-blue/30 focus:border-pit-blue resize-y transition-all"
                            />
                        )}
                    </div>
                ))}
```

The native `<input type="radio">` and `<input type="checkbox">` elements are visually hidden with `sr-only` (screen-reader only — they're still accessible to assistive technology and keyboard navigation). The visible styled `<span>` elements act as custom controls, but they're wrapped in a `<label>` that ties them to the hidden input, so clicking anywhere on the row still registers correctly.

### Submit Area

```tsx
                {/* Submit area */}
                <div className="pt-4 pb-12 relative z-10">
                    <div className="p-6 rounded-2xl border border-white/40 bg-white/40 backdrop-blur-xl shadow-sm">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div>
                                <p className="text-pit-grey font-semibold">Ready to submit?</p>
                                <p className="text-pit-grey-light text-sm mt-0.5">
                                    {answeredCount === questions.length
                                        ? 'All questions answered!'
                                        : `${questions.length - answeredCount} question${questions.length - answeredCount !== 1 ? 's' : ''} remaining`}
                                </p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <button
                                    onClick={handleSubmit}
                                    disabled={submitState === 'sending'}
                                    className={`px-8 py-3 rounded-xl font-semibold tracking-wide shadow-md transition-all duration-200 cursor-pointer whitespace-nowrap ${
                                        submitState === 'sending'
                                            ? 'bg-gray-400 text-white cursor-not-allowed'
                                            : 'bg-pit-blue text-white hover:bg-pit-blue-dark hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]'
                                    }`}
                                >
                                    {submitState === 'sending' ? (
                                        <span className="flex items-center gap-2">
                                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                                                <path d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" fill="currentColor" className="opacity-75" />
                                            </svg>
                                            Sending…
                                        </span>
                                    ) : (
                                        'Submit Test'
                                    )}
                                </button>
                                {submitState === 'error' && errorMsg && (
                                    <p className="text-sm text-red-500 animate-fade-in">{errorMsg}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    ); // end of const page
```

## Final Return: Page + Lightbox

The component's actual `return` statement renders `page` and the lightbox modal together inside a React Fragment (`<>`). The lightbox must live outside the `page` tree because it uses `position: fixed` to cover the entire viewport — if it were inside a parent with `overflow: hidden` or a stacking context, it could be clipped.

```tsx
    return (
        <>
            {page}

            {/* Lightbox modal — only rendered when lightboxSrc is set */}
            {lightboxSrc && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
                    onClick={() => setLightboxSrc(null)} // clicking the backdrop closes the modal
                >
                    {/* Blurred dark backdrop */}
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

                    {/* Close button */}
                    <button
                        onClick={() => setLightboxSrc(null)}
                        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white text-xl font-bold flex items-center justify-center transition-colors"
                    >
                        ×
                    </button>

                    {/* The enlarged image — stopPropagation prevents clicking the image from closing the modal */}
                    <img
                        src={lightboxSrc}
                        alt="Enlarged question image"
                        className="relative z-10 max-w-[90vw] max-h-[85vh] rounded-2xl shadow-2xl object-contain"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    );
}
```

The `e.stopPropagation()` on the image is a subtle but important detail. Without it, clicking the image itself would bubble up to the outer `div`'s `onClick` handler and close the lightbox. By stopping propagation, we ensure only a click on the backdrop (or the ×  button) dismisses it.

---

> **Icon registration reminder:** The `ion-icon` elements in this file (`checkmark-outline` on the success screen and `person-outline` on the name fields card) rely on the Ionicons setup described in Part 1 — specifically the `setupAllIcons()` call in `main.tsx` and the CDN script tags in `index.html`. Both icons must be registered in `src/icons/index.ts` for them to render.
