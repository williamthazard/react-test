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
    const [draggingOver, setDraggingOver] = useState<number | null>(null);
    const [uploadingImage, setUploadingImage] = useState<number | null>(null);
    const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

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
const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
};

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
    converted.prompt = q.prompt;
    if (newType !== 'essay' && q.type !== 'essay') {
        const opts = (q as MultipleChoiceQuestion | MultipleAnswerQuestion).options;
        (converted as MultipleChoiceQuestion | MultipleAnswerQuestion).options = [...opts];
    }
    updateQuestion(index, converted);
};
```

## Image Compression and Storage

A core feature of the editor is the ability to attach images to question stems. To maintain security and avoid configuring public storage buckets, images are compressed and converted to Base64 data URLs right in the browser, then saved directly inside the `Question` JSON object.

We use an HTML `<canvas>` to resize the image to a maximum dimension of 800px and compress it as a JPEG at 70% quality:

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

The editor allows users to drag an image file from their desktop directly onto the text area of a question. We wrap the text area in a container that listens to HTML DOM drop events:

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

## Render Structure

With state tracking and handlers defined, the `TestEditor` finally returns the JSX component tree. The UI is wrapped in a `<Reorder.Group>` which maps over each question to attach the handlers we defined above:

```tsx
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
                            <svg className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
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
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Shuffle Questions
                    </button>
                </div>
            </div>

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
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
                                        </svg>
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
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
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
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
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
                                                    <svg className="absolute w-2.5 h-2.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <span className="text-xs font-semibold text-pit-grey-light group-hover:text-pit-blue transition-colors">Randomize order</span>
                                            </label>
                                            <button
                                                onClick={() => shuffleOptions(qIndex)}
                                                className="text-xs font-semibold text-pit-blue/70 hover:text-pit-blue flex items-center gap-1 transition-colors"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                                Shuffle
                                            </button>
                                        </div>
                                    </div>

                                    <Reorder.Group axis="y" values={(q as MultipleChoiceQuestion | MultipleAnswerQuestion).options} onReorder={(opts) => reorderOptions(qIndex, opts)} className="space-y-2">
                                        {(q as MultipleChoiceQuestion | MultipleAnswerQuestion).options.map((opt, oIndex) => (
                                            <Reorder.Item key={`${q.id}-opt-${opt}-${oIndex}`} value={opt} className="flex items-center gap-2">
                                                <div className="cursor-grab active:cursor-grabbing p-1 text-pit-blue/30 hover:text-pit-blue transition-colors">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
                                                    </svg>
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
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </Reorder.Item>
                                        ))}
                                    </Reorder.Group>

                                    {/* Add option */}
                                    <button
                                        onClick={() => addOption(qIndex)}
                                        className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-pit-blue hover:text-pit-blue/80 transition-all"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                        </svg>
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
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
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
