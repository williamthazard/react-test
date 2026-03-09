# Part 5: Editor Mode (`TestEditor.tsx`)

The `TestEditor` is an interactive builder that enables teachers to create and modify questions, reorder them, and attach compressed images directly to the database.

## State Management and Initialization

The editor leverages `framer-motion` for spring-physics drag-and-drop reordering logic. It receives the `initialPayload` structured data prop passed down from `App.tsx` (which originated from `AccessCodeWall`). If this exists, the editor skips the loading screen. 

```tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { Reorder } from 'framer-motion';
import {
    loadQuestions,
    saveQuestions,
    type Question,
    type MultipleChoiceQuestion,
    type MultipleAnswerQuestion,
    type TestDataPayload,
    type TestConfig
} from '../data/questionsData';

type QuestionType = 'multiple-choice' | 'multiple-answer' | 'essay';

// Why stable option IDs?
// Framer Motion's Reorder.Item uses its `key` prop to track DOM identity across renders.
// If we used the option's array index as the key, every keypress in a text input would
// cause React to re-mount that input (because the values array changes, shifting indices),
// which resets the cursor to the end of the field. By assigning each option a stable,
// never-changing ID on creation and using that as the key instead, the DOM element is
// preserved across re-renders and the cursor stays where the user left it.
let optionIdCounter = 0;
const generateOptionId = () => `opt-${++optionIdCounter}`;

function createBlankQuestion(id: number, qType: QuestionType): Question {
    switch (qType) {
        case 'essay':
            return { id, type: 'essay', prompt: '' };
        case 'multiple-answer':
            return { id, type: 'multiple-answer', prompt: '', options: ['', ''], correctIndices: [0] };
        default:
            return { id, type: 'multiple-choice', prompt: '', options: ['', ''], correctIndex: 0 };
    }
}

export default function TestEditor({ code, initialPayload }: { code: string; initialPayload?: TestDataPayload | null }) {
    // 1. Core Data State
    const [questions, setQuestions] = useState<Question[]>([]);
    const [config, setConfig] = useState<TestConfig>({});
    
    // 2. Loading & Network State
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [saving, setSaving] = useState(false);
    
    // 3. Ephemeral UI State
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [confirmReset, setConfirmReset] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

    // emailInput holds the value of the "add recipient" text field.
    // It is ephemeral UI state — it never gets saved to the database directly.
    // Only the resolved list stored in config.recipientEmails is persisted.
    const [emailInput, setEmailInput] = useState('');
    const [draggingOver, setDraggingOver] = useState<number | null>(null);
    const [uploadingImage, setUploadingImage] = useState<number | null>(null);
    // useRef is used instead of useState for both fileInputRefs and optionIdsRef because
    // neither needs to trigger a re-render when it changes. Refs are mutable containers
    // that persist across renders without causing them — perfect for things like DOM node
    // references and tracking data that is only needed at interaction time.
    const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

    // Map: questionId -> array of stable option IDs (same length as the options array).
    // This lives in a ref rather than state because changing it should never trigger a render;
    // it is only read during render to supply the `key` prop to each Reorder.Item.
    const optionIdsRef = useRef<Record<number, string[]>>({});

    // Helper to get or create option IDs for a question
    const getOptionIds = (questionId: number, optionsCount: number): string[] => {
        if (!optionIdsRef.current[questionId]) {
            optionIdsRef.current[questionId] = Array.from({ length: optionsCount }, () => generateOptionId());
        }
        // Ensure we have enough IDs (in case options were added)
        while (optionIdsRef.current[questionId].length < optionsCount) {
            optionIdsRef.current[questionId].push(generateOptionId());
        }
        return optionIdsRef.current[questionId];
    };

    const doLoad = () => {
        setLoading(true);
        setLoadError(false);
        loadQuestions(code)
            .then((payload) => {
                setQuestions(payload.questions);
                setConfig(payload.settings);
                setLoading(false);
            })
            .catch(() => {
                setLoadError(true);
                setLoading(false);
            });
    };

    useEffect(() => {
        if (initialPayload) {
            setQuestions(initialPayload.questions);
            setConfig(initialPayload.settings);
            setLoading(false);
        } else {
            // Fallback load code if the component mounts without preloaded payload (e.g. forced refresh)
            doLoad();
        }
    }, [initialPayload, code]);
```

> **Component Structure Note:** 
> The code snippets below for Image Compression, Drag-and-Drop, and Saving Changes are all handler functions. They should be placed **inside** the `TestEditor` component's body, just below the `useEffect` hook block and before the `return` statement.

## Helper Functions

The editor relies on a small suite of functional helpers to dispatch ephemeral UI feedback and immutable state updates to the questions array.

```tsx
// showToast sets the toast message and schedules its removal after 3 seconds.
// The toast state is null when hidden and { type, message } when visible.
const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
};

// updateQuestion replaces one question in the array immutably.
// We use the functional form of setQuestions (passing a callback) so that the update
// is always based on the latest state, not a stale closure value.
const updateQuestion = (index: number, updated: Question) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? updated : q)));
};

const updatePrompt = (index: number, prompt: string) => {
    updateQuestion(index, { ...questions[index], prompt });
};

const changeType = (index: number, newType: QuestionType) => {
    const q = questions[index];
    if (q.type === newType) return;
    const converted = createBlankQuestion(q.id, newType);
    converted.prompt = q.prompt; // always preserve the prompt text
    // If switching between the two option-based types (multiple-choice ↔ multiple-answer),
    // preserve the existing option strings. If switching to or from essay (which has no options),
    // let createBlankQuestion supply fresh empty options.
    if (newType !== 'essay' && q.type !== 'essay') {
        const opts = (q as MultipleChoiceQuestion | MultipleAnswerQuestion).options;
        (converted as MultipleChoiceQuestion | MultipleAnswerQuestion).options = [...opts];
    }
    updateQuestion(index, converted);
};

const addQuestion = () => {
    const maxId = questions.reduce((max, q) => Math.max(max, q.id), 0);
    setQuestions((prev) => [...prev, createBlankQuestion(maxId + 1, 'multiple-choice')]);
};

// ── Recipient Email Handlers ──

// addRecipient validates the current emailInput and, if it looks like an email address
// and isn't already in the list, appends it to config.recipientEmails and clears the input.
// This is a great example of "optimistic state update" — we update local state immediately
// without waiting for a server response. The change only actually persists when the editor
// hits Save (which calls saveQuestions with the full config object).
const addRecipient = () => {
    const email = emailInput.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    const current = config.recipientEmails ?? [];
    if (current.includes(email)) return;
    setConfig({ ...config, recipientEmails: [...current, email] });
    setEmailInput('');
};

const removeRecipient = (email: string) => {
    const current = config.recipientEmails ?? [];
    setConfig({ ...config, recipientEmails: current.filter((e) => e !== email) });
};

const deleteQuestion = (index: number) => {
    if (questions.length <= 1) return; // prevent deleting the last question
    setQuestions((prev) => prev.filter((_, i) => i !== index));
    setConfirmDelete(null);
};

// handleReset restores the default question set and clears config.
// It does NOT save automatically — the editor must click Save to persist the reset.
// This is intentional: it gives the teacher a chance to cancel by refreshing the page.
const handleReset = () => {
    setQuestions([...defaultQuestions]);
    setConfig({});
    setConfirmReset(false);
    showToast('success', 'Reset to default questions. Click Save to persist.');
};

// ── Option Handlers ──
const updateOption = (qIndex: number, oIndex: number, value: string) => {
    const q = questions[qIndex] as MultipleChoiceQuestion | MultipleAnswerQuestion;
    const newOpts = [...q.options];
    newOpts[oIndex] = value;
    updateQuestion(qIndex, { ...q, options: newOpts });
};

const addOption = (qIndex: number) => {
    const q = questions[qIndex] as MultipleChoiceQuestion | MultipleAnswerQuestion;
    updateQuestion(qIndex, { ...q, options: [...q.options, ''] });
};

const deleteOption = (qIndex: number, oIndex: number) => {
    const q = questions[qIndex] as MultipleChoiceQuestion | MultipleAnswerQuestion;
    if (q.options.length <= 2) return; // minimum 2 options enforced

    // Remove the stable ID for the deleted option so the ref stays in sync
    if (optionIdsRef.current[q.id]) {
        optionIdsRef.current[q.id] = optionIdsRef.current[q.id].filter((_, i) => i !== oIndex);
    }

    const newOpts = q.options.filter((_, i) => i !== oIndex);
    if (q.type === 'multiple-choice') {
        const mc = q as MultipleChoiceQuestion;
        let newCorrect = mc.correctIndex;
        // If the deleted option WAS the correct answer, reset to 0.
        // If the deleted option was BEFORE the correct answer, shift the index down by 1
        // because all subsequent options have moved one position earlier.
        if (oIndex === newCorrect) newCorrect = 0;
        else if (oIndex < newCorrect) newCorrect--;
        updateQuestion(qIndex, { ...mc, options: newOpts, correctIndex: newCorrect });
    } else {
        const ma = q as MultipleAnswerQuestion;
        // Same idea for multiple-answer: remove the deleted index from correctIndices,
        // and decrement any index that was after the deleted position.
        const newCorrectIndices = ma.correctIndices
            .filter((ci) => ci !== oIndex)
            .map((ci) => (ci > oIndex ? ci - 1 : ci));
        // If all correct answers were deleted (edge case), default to [0]
        updateQuestion(qIndex, { ...ma, options: newOpts, correctIndices: newCorrectIndices.length ? newCorrectIndices : [0] });
    }
};

const setCorrectIndex = (qIndex: number, oIndex: number) => {
    const q = questions[qIndex] as MultipleChoiceQuestion;
    updateQuestion(qIndex, { ...q, correctIndex: oIndex });
};

const toggleCorrectIndex = (qIndex: number, oIndex: number) => {
    const q = questions[qIndex] as MultipleAnswerQuestion;
    const has = q.correctIndices.includes(oIndex);
    let newIndices: number[];
    if (has) {
        newIndices = q.correctIndices.filter((ci) => ci !== oIndex);
        if (newIndices.length === 0) return;
    } else {
        newIndices = [...q.correctIndices, oIndex].sort((a, b) => a - b);
    }
    updateQuestion(qIndex, { ...q, correctIndices: newIndices });
};

const toggleRandomizeOptions = (qIndex: number) => {
    const q = questions[qIndex] as MultipleChoiceQuestion | MultipleAnswerQuestion;
    updateQuestion(qIndex, { ...q, randomizeOptions: !q.randomizeOptions });
};

const shuffleOptions = (qIndex: number) => {
    const q = questions[qIndex] as MultipleChoiceQuestion | MultipleAnswerQuestion;
    const originalOptions = [...q.options];
    const currentIds = optionIdsRef.current[q.id] || [];

    // Shuffle with indices to track ID reordering
    const indexed = q.options.map((value, index) => ({ value, index, sort: Math.random() }));
    indexed.sort((a, b) => a.sort - b.sort);
    const shuffledOptions = indexed.map(({ value }) => value);

    // Reorder the option IDs to match
    optionIdsRef.current[q.id] = indexed.map(({ index }) => currentIds[index] || generateOptionId());

    if (q.type === 'multiple-choice') {
        const correctStr = originalOptions[q.correctIndex];
        const newIndex = shuffledOptions.indexOf(correctStr);
        updateQuestion(qIndex, { ...q, options: shuffledOptions, correctIndex: newIndex > -1 ? newIndex : 0 });
    } else {
        const correctStrs = q.correctIndices.map(i => originalOptions[i]);
        const newIndices = correctStrs.map(str => shuffledOptions.indexOf(str)).filter(i => i > -1).sort((a, b) => a - b);
        updateQuestion(qIndex, { ...q, options: shuffledOptions, correctIndices: newIndices.length ? newIndices : [0] });
    }
};

const reorderOptions = (qIndex: number, newOptions: string[]) => {
    const q = questions[qIndex] as MultipleChoiceQuestion | MultipleAnswerQuestion;
    const originalOptions = [...q.options];
    const currentIds = optionIdsRef.current[q.id] || [];

    // Reorder the option IDs to match the new order
    const newIds = newOptions.map((opt) => {
        const oldIndex = originalOptions.indexOf(opt);
        return currentIds[oldIndex] || generateOptionId();
    });
    optionIdsRef.current[q.id] = newIds;

    if (q.type === 'multiple-choice') {
        const correctStr = originalOptions[q.correctIndex];
        const newIndex = newOptions.indexOf(correctStr);
        updateQuestion(qIndex, { ...q, options: newOptions, correctIndex: newIndex > -1 ? newIndex : 0 });
    } else {
        const correctStrs = q.correctIndices.map(i => originalOptions[i]);
        const newIndices = correctStrs.map(str => newOptions.indexOf(str)).filter(i => i > -1).sort((a, b) => a - b);
        updateQuestion(qIndex, { ...q, options: newOptions, correctIndices: newIndices.length ? newIndices : [0] });
    }
};
```

## Image Compression and Storage

A core feature of the editor is the ability to attach images to question stems. To maintain security and avoid configuring public storage buckets, images are compressed and converted to Base64 data URLs right in the browser, then saved directly inside the `Question` JSON object.

We use an HTML `<canvas>` to resize the image to a maximum dimension of 800px and compress it as a JPEG at 70% quality. The pipeline is: `File` → `FileReader` (converts to a data URL string) → `Image` (loads the data URL so we can get dimensions) → `canvas` (draws and re-encodes at reduced quality).

`compressImage` is wrapped in `useCallback` so that its reference stays stable across re-renders. This matters because `handleImageFile` depends on it — if `compressImage` got a new reference every render, `handleImageFile` would also get a new reference, potentially breaking memoization further up the tree.

```tsx
const compressImage = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX = 800;
                let { width, height } = img;
                if (width > MAX || height > MAX) {
                    if (width > height) {
                        height = Math.round((height * MAX) / width);
                        width = MAX;
                    } else {
                        width = Math.round((width * MAX) / height);
                        height = MAX;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = reject;
            img.src = reader.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}, []);

const handleImageFile = useCallback(async (qIndex: number, file: File) => {
    if (!file.type.startsWith('image/')) {
        showToast('error', 'Please drop an image file');
        return;
    }
    setUploadingImage(qIndex);
    try {
        const dataUrl = await compressImage(file);
        updateQuestion(qIndex, { ...questions[qIndex], imageUrl: dataUrl });
    } catch {
        showToast('error', 'Failed to process image');
    }
    setUploadingImage(null);
}, [questions, compressImage]);

const removeImage = (qIndex: number) => {
    updateQuestion(qIndex, { ...questions[qIndex], imageUrl: undefined });
};
```

## Drag-and-Drop Handlers

The editor allows users to drag an image file from their desktop directly onto the text area of a question. We wrap the text area in a container that listens to HTML DOM drop events.

`e.preventDefault()` in `handleDragOver` is critical — browsers block `drop` events by default to prevent malicious pages from intercepting file drags. Calling `preventDefault()` on the `dragover` event opts the element in as a valid drop target. Without it, `handleDrop` will never fire.

```tsx
const handleDragOver = (e: React.DragEvent, qIndex: number) => {
    e.preventDefault();
    setDraggingOver(qIndex);
};

const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingOver(null);
};

const handleDrop = async (e: React.DragEvent, qIndex: number) => {
    e.preventDefault();
    setDraggingOver(null);
    const file = e.dataTransfer.files?.[0];
    if (file) await handleImageFile(qIndex, file);
};
```

## Saving Changes

Because the editor array is just standard React state (managed smoothly by `Reorder.Group`), we push both the global settings configuration and the questions array to the server using the `saveQuestions` API wrapper from Part 3.

```tsx
const handleSave = async () => {
    try {
        setSaving(true);
        await saveQuestions(code, { settings: config, questions });
        showToast('success', 'Changes saved successfully');
    } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Failed to save');
    } finally {
        setSaving(false);
    }
};
```

## Early Returns

Before the main render, we handle loading and error states with early returns — the same pattern used in TestPage:

```tsx
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#e8edf5] via-[#dde4f0] to-[#d0d9eb]">
                <div className="text-pit-blue text-lg font-semibold animate-pulse">Loading editor…</div>
            </div>
        );
    }

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

## Render Structure

With state tracking and handlers defined, the `TestEditor` returns the JSX component tree. A few structural notes before reading the JSX:

- **`Reorder.Group`** wraps the questions array. `axis="y"` constrains dragging to the vertical axis. `values={questions}` tells Framer Motion the current order. `onReorder={setQuestions}` is called with the new order after a drag completes — it replaces the entire array in one state update.
- **`Reorder.Item`** must use `key={q.id}` — the question's stable numeric ID — rather than the array index. If we used the index, React would re-mount components as they moved rather than animate them, breaking the drag-and-drop.
- **`style={{ y: 0 }}`** on each `Reorder.Item` resets the Framer Motion y-transform after a drag, preventing the item from staying visually offset from its layout position.
- **The custom checkbox** (the "Randomize question order" toggle) uses Tailwind's `peer` utility. The actual `<input type="checkbox">` is hidden with `sr-only` (removed from the visual flow but still accessible). The styled `<div>` next to it uses `peer-checked:` variants to change appearance when the hidden checkbox is checked. This gives full keyboard and screen-reader accessibility while using custom visual styling.

The UI is wrapped in a `<Reorder.Group>` which maps over each question:

```tsx
    const typeLabels: Record<QuestionType, string> = {
        'multiple-choice': 'Multiple Choice',
        'multiple-answer': 'Multiple Answer',
        essay: 'Essay',
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#1E3B70] via-[#2A5298] to-[#1E3B70]">
            <header className="sticky top-0 z-50 bg-[#1E3B70]/80 backdrop-blur-xl border-b border-white/10 shadow-sm">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <img
                            src={`${import.meta.env.BASE_URL}PIT_logo_blue.png`}
                            alt="PIT"
                            className="w-10 h-10 object-contain drop-shadow-md"
                            style={{ filter: 'brightness(0) invert(1)' }}
                        />
                        <div>
                            <h1 className="text-xl font-bold text-white font-heading tracking-tight">Test Editor</h1>
                            <p className="text-xs text-blue-200 mt-0.5">{questions.length} questions</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setConfirmReset(true)}
                            className="px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white border border-white/20 hover:border-white/40 rounded-lg transition-all"
                        >
                            Reset
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-1.5 text-sm font-semibold text-pit-blue bg-pit-yellow hover:bg-yellow-400 rounded-lg shadow-md transition-all disabled:opacity-50"
                        >
                            {saving ? 'Saving…' : 'Save'}
                        </button>
                    </div>
                </div>
            </header>

            {/* Toast */}
            {toast && (
                <div className={`fixed top-14 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                    }`}>
                    {toast.message}
                </div>
            )}

            {/* Confirm reset modal */}
            {confirmReset && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm mx-4">
                        <h3 className="text-lg font-bold text-pit-grey mb-2">Reset to Defaults?</h3>
                        <p className="text-sm text-pit-grey-light mb-4">
                            This will replace all current questions with the default set. You'll still need to click Save to persist.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setConfirmReset(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 transition-all">Cancel</button>
                            <button onClick={handleReset} className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-all">Reset</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm delete modal */}
            {confirmDelete !== null && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm mx-4">
                        <h3 className="text-lg font-bold text-pit-grey mb-2">Delete Question?</h3>
                        <p className="text-sm text-pit-grey-light mb-4">This action cannot be undone.</p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 transition-all">Cancel</button>
                            <button onClick={() => deleteQuestion(confirmDelete)} className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-all">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Global Settings */}
            <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-2">
                <div className="flex items-center justify-between p-4 rounded-xl border border-white/40 bg-white/40 backdrop-blur-md shadow-sm">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative flex items-center justify-center">
                            <input
                                type="checkbox"
                                checked={!!config.randomizeQuestions}
                                onChange={(e) => setConfig({ ...config, randomizeQuestions: e.target.checked })}
                                className="peer sr-only"
                            />
                            <div className="w-5 h-5 rounded border-2 border-pit-blue/30 bg-white/60 peer-checked:bg-pit-blue peer-checked:border-pit-blue transition-all" />
                            <ion-icon name="checkmark-outline" className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                        </div>
                        <span className="text-sm font-semibold text-pit-grey group-hover:text-pit-blue transition-colors">Randomize question order for students</span>
                    </label>

                    <button
                        onClick={() => {
                            const shuffled = [...questions].sort(() => Math.random() - 0.5);
                            setQuestions(shuffled);
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-pit-blue bg-white/60 hover:bg-white border border-pit-blue/20 rounded-lg shadow-sm transition-all"
                    >
                        <ion-icon name="shuffle-outline" className="w-4 h-4" />
                        Shuffle Questions
                    </button>
                </div>
            </div>

                {/* Result Recipients
                    This card lives inside the same container as the Global Settings card above.
                    It manages config.recipientEmails — the list of addresses that will receive
                    submitted test results. The editor can add multiple addresses and remove any
                    of them. The list is saved as part of TestConfig alongside the questions.

                    Key concepts illustrated here:
                    - Controlled inputs: emailInput state drives the <input> value
                    - Array state updates: always create a new array (spread) rather than mutating
                    - Keyboard UX: hitting Enter in the input field calls addRecipient, matching
                      the behavior of the Add button — a small but important usability detail
                */}
                <div className="mt-3 p-4 rounded-xl border border-white/40 bg-white/40 backdrop-blur-md shadow-sm space-y-3">
                    <p className="text-sm font-semibold text-pit-grey">Result Recipients</p>

                    {/* Existing recipients rendered as dismissible tags */}
                    <div className="flex flex-wrap gap-2">
                        {(config.recipientEmails ?? []).map((email) => (
                            <span key={email} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-pit-blue/10 border border-pit-blue/20 text-xs font-semibold text-pit-blue">
                                {email}
                                <button
                                    onClick={() => removeRecipient(email)}
                                    className="hover:text-red-500 transition-colors leading-none"
                                    title="Remove"
                                >
                                    <ion-icon name="close-outline" className="w-3.5 h-3.5" />
                                </button>
                            </span>
                        ))}
                        {(config.recipientEmails ?? []).length === 0 && (
                            <span className="text-xs text-gray-400 italic">No recipients configured — results will go to the default address.</span>
                        )}
                    </div>

                    {/* Add new recipient */}
                    <div className="flex gap-2">
                        <input
                            type="email"
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRecipient(); } }}
                            placeholder="name@school.edu"
                            className="flex-1 px-3 py-2 rounded-lg border border-white/40 bg-white/60 text-pit-grey text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-pit-blue/30"
                        />
                        <button
                            onClick={addRecipient}
                            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-pit-blue bg-white/60 hover:bg-white border border-pit-blue/20 rounded-lg shadow-sm transition-all"
                        >
                            <ion-icon name="add-outline" className="w-4 h-4" />
                            Add
                        </button>
                    </div>
                </div>
            </div>{/* end Global Settings container */}

            {/* Questions */}
            <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-4 space-y-6">
                <Reorder.Group axis="y" values={questions} onReorder={setQuestions} className="space-y-6">
                    {questions.map((q, qIndex) => (
                        <Reorder.Item
                            key={q.id}
                            value={q}
                            className="p-6 rounded-2xl border border-white/40 bg-white/40 backdrop-blur-xl shadow-sm hover:shadow-md transition-shadow cursor-default"
                            style={{ y: 0 }}
                        >
                            {/* Header row */}
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="cursor-grab active:cursor-grabbing p-1.5 -ml-1.5 rounded-lg hover:bg-pit-blue/10 text-pit-blue/40 hover:text-pit-blue transition-colors" title="Drag to reorder">
                                        <ion-icon name="reorder-two-outline" className="w-5 h-5" />
                                    </div>
                                    <span className="w-8 h-8 rounded-full bg-pit-blue text-white text-sm font-bold flex items-center justify-center">
                                        {qIndex + 1}
                                    </span>
                                    <select
                                        value={q.type}
                                        onChange={(e) => changeType(qIndex, e.target.value as QuestionType)}
                                        className="text-xs font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full border border-pit-blue/20 bg-white/80 text-pit-blue focus:outline-none focus:ring-2 focus:ring-pit-blue/30"
                                    >
                                        {(Object.keys(typeLabels) as QuestionType[]).map((t) => (
                                            <option key={t} value={t}>{typeLabels[t]}</option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    onClick={() => setConfirmDelete(qIndex)}
                                    className="p-2 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-all"
                                    title="Delete question"
                                >
                                    <ion-icon name="trash-outline" className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Prompt + image drop zone */}
                            <div
                                className={`relative rounded-xl transition-all ${draggingOver === qIndex
                                    ? 'ring-2 ring-pit-blue ring-offset-2 bg-pit-blue/5'
                                    : ''
                                    }`}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setDraggingOver(qIndex);
                                }}
                                onDragLeave={() => setDraggingOver(null)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setDraggingOver(null);
                                    const file = e.dataTransfer.files[0];
                                    if (file) handleImageFile(qIndex, file);
                                }}
                            >
                                <textarea
                                    value={q.prompt}
                                    onChange={(e) => updatePrompt(qIndex, e.target.value)}
                                    placeholder="Enter question prompt…"
                                    rows={3}
                                    className="w-full px-4 py-3 rounded-xl border border-white/40 bg-white/60 text-pit-grey placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-pit-blue/30 font-body text-sm resize-y"
                                />

                                {/* Drag overlay */}
                                {draggingOver === qIndex && (
                                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-pit-blue/10 border-2 border-dashed border-pit-blue/40 pointer-events-none">
                                        <span className="text-pit-blue font-semibold text-sm">Drop image here</span>
                                    </div>
                                )}
                            </div>

                            {/* Image preview or add button */}
                            {q.imageUrl ? (
                                <div className="mt-3 relative inline-block group">
                                    <img
                                        src={q.imageUrl}
                                        alt="Question attachment"
                                        className="max-h-48 rounded-xl border border-white/40 shadow-sm"
                                    />
                                    <button
                                        onClick={() => removeImage(qIndex)}
                                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                        title="Remove image"
                                    >
                                        ×
                                    </button>
                                </div>
                            ) : (
                                <div className="mt-2 flex items-center gap-2">
                                    <button
                                        onClick={() => fileInputRefs.current[qIndex]?.click()}
                                        disabled={uploadingImage === qIndex}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-pit-grey-light hover:text-pit-blue border border-white/40 hover:border-pit-blue/30 rounded-lg transition-all disabled:opacity-50"
                                    >
                                        {uploadingImage === qIndex ? (
                                            <span className="animate-pulse">Processing…</span>
                                        ) : (
                                            <>
                                                <ion-icon name="image-outline" className="w-4 h-4" />
                                                Add image
                                            </>
                                        )}
                                    </button>
                                    <span className="text-[10px] text-gray-400">or drag &amp; drop onto the prompt</span>
                                    <input
                                        ref={(el) => { fileInputRefs.current[qIndex] = el; }}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleImageFile(qIndex, file);
                                            e.target.value = '';
                                        }}
                                    />
                                </div>
                            )}

                            {/* Options for MC and MA */}
                            {q.type !== 'essay' && (
                                <div className="mt-8 space-y-4">
                                    <div className="flex items-center justify-between border-t border-black/5 pt-4">
                                        <p className="text-xs font-semibold text-pit-grey-light uppercase tracking-wider">
                                            {q.type === 'multiple-choice' ? 'Select the correct answer:' : 'Select all correct answers:'}
                                        </p>
                                        <div className="flex items-center gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <div className="relative flex items-center justify-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!(q as MultipleChoiceQuestion).randomizeOptions}
                                                        onChange={() => toggleRandomizeOptions(qIndex)}
                                                        className="peer sr-only"
                                                    />
                                                    <div className="w-4 h-4 rounded border-2 border-pit-blue/30 bg-white/60 peer-checked:bg-pit-blue peer-checked:border-pit-blue transition-all" />
                                                    <ion-icon name="checkmark-outline" className="absolute w-2.5 h-2.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                                                </div>
                                                <span className="text-xs font-semibold text-pit-grey-light group-hover:text-pit-blue transition-colors">Randomize order</span>
                                            </label>
                                            <button
                                                onClick={() => shuffleOptions(qIndex)}
                                                className="text-xs font-semibold text-pit-blue/70 hover:text-pit-blue flex items-center gap-1 transition-colors"
                                            >
                                                <ion-icon name="shuffle-outline" className="w-3.5 h-3.5" />
                                                Shuffle
                                            </button>
                                        </div>
                                    </div>

                                    <Reorder.Group axis="y" values={(q as MultipleChoiceQuestion | MultipleAnswerQuestion).options} onReorder={(opts) => reorderOptions(qIndex, opts)} className="space-y-2">
                                        {(q as MultipleChoiceQuestion | MultipleAnswerQuestion).options.map((opt, oIndex) => {
                                            const optionIds = getOptionIds(q.id, (q as MultipleChoiceQuestion | MultipleAnswerQuestion).options.length);
                                            return (
                                            <Reorder.Item key={optionIds[oIndex]} value={opt} className="flex items-center gap-2">
                                                <div className="cursor-grab active:cursor-grabbing p-1 text-pit-blue/30 hover:text-pit-blue transition-colors">
                                                    <ion-icon name="reorder-two-outline" className="w-4 h-4" />
                                                </div>
                                                {/* Correct indicator */}
                                                {q.type === 'multiple-choice' ? (
                                                    <input
                                                        type="radio"
                                                        name={`correct-${q.id}`}
                                                        checked={(q as MultipleChoiceQuestion).correctIndex === oIndex}
                                                        onChange={() => setCorrectIndex(qIndex, oIndex)}
                                                        className="w-4 h-4 accent-[#3161AC] shrink-0"
                                                    />
                                                ) : (
                                                    <input
                                                        type="checkbox"
                                                        checked={(q as MultipleAnswerQuestion).correctIndices.includes(oIndex)}
                                                        onChange={() => toggleCorrectIndex(qIndex, oIndex)}
                                                        className="w-4 h-4 accent-[#F7CC07] shrink-0 rounded"
                                                    />
                                                )}

                                                {/* Option letter */}
                                                <span className="w-6 h-6 rounded-md bg-pit-blue/10 text-pit-blue text-xs font-bold flex items-center justify-center shrink-0">
                                                    {String.fromCharCode(65 + oIndex)}
                                                </span>

                                                {/* Option text */}
                                                <input
                                                    type="text"
                                                    value={opt}
                                                    onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                                                    placeholder={`Option ${String.fromCharCode(65 + oIndex)}…`}
                                                    className="flex-1 px-3 py-2 rounded-lg border border-white/40 bg-white/60 text-pit-grey text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-pit-blue/30"
                                                />

                                                {/* Delete option */}
                                                {(q as MultipleChoiceQuestion | MultipleAnswerQuestion).options.length > 2 && (
                                                    <button
                                                        onClick={() => deleteOption(qIndex, oIndex)}
                                                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                                                        title="Remove option"
                                                    >
                                                        <ion-icon name="close-outline" className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </Reorder.Item>
                                            );
                                        })}
                                    </Reorder.Group>

                                    {/* Add option */}
                                    <button
                                        onClick={() => addOption(qIndex)}
                                        className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-pit-blue hover:text-pit-blue/80 transition-all"
                                    >
                                        <ion-icon name="add-outline" className="w-4 h-4" />
                                        Add option
                                    </button>
                                </div>
                            )}
                        </Reorder.Item>
                    ))}

                </Reorder.Group>

                {/* Add question */}
                <button
                    onClick={addQuestion}
                    className="w-full p-4 rounded-2xl border-2 border-dashed border-pit-blue/30 text-pit-blue font-semibold hover:border-pit-blue/50 hover:bg-white/30 transition-all flex items-center justify-center gap-2"
                >
                    <ion-icon name="add-outline" className="w-5 h-5" />
                    Add Question
                </button>

                {/* Bottom save */}
                <div className="pt-4 pb-12">
                    <div className="p-6 rounded-2xl border border-white/40 bg-white/40 backdrop-blur-xl shadow-sm">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-pit-grey-light">
                                {questions.length} question{questions.length !== 1 ? 's' : ''}
                            </p>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-8 py-3 text-base font-bold text-pit-blue bg-pit-yellow hover:bg-yellow-400 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
                            >
                                {saving ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
```
