import { useState, useEffect } from 'react';
import {
    type Question,
    type MultipleChoiceQuestion,
    type MultipleAnswerQuestion,
    defaultQuestions,
    loadQuestions,
    saveQuestions,
} from '../data/questionsData';

type QuestionType = 'multiple-choice' | 'multiple-answer' | 'essay';

function createBlankQuestion(id: number, qType: QuestionType): Question {
    if (qType === 'essay') {
        return { id, type: 'essay', prompt: '' };
    }
    if (qType === 'multiple-answer') {
        return { id, type: 'multiple-answer', prompt: '', options: ['', ''], correctIndices: [0] };
    }
    return { id, type: 'multiple-choice', prompt: '', options: ['', ''], correctIndex: 0 };
}

export default function TestEditor() {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [confirmReset, setConfirmReset] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

    useEffect(() => {
        loadQuestions().then((q) => {
            setQuestions(q);
            setLoading(false);
        });
    }, []);

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 3000);
    };

    const updateQuestion = (index: number, updated: Question) => {
        setQuestions((prev) => prev.map((q, i) => (i === index ? updated : q)));
    };

    const changeType = (index: number, newType: QuestionType) => {
        const q = questions[index];
        if (q.type === newType) return;
        const converted = createBlankQuestion(q.id, newType);
        converted.prompt = q.prompt;
        if (newType !== 'essay' && q.type !== 'essay') {
            // Preserve options when switching between MC variants
            const opts = (q as MultipleChoiceQuestion | MultipleAnswerQuestion).options;
            (converted as MultipleChoiceQuestion | MultipleAnswerQuestion).options = [...opts];
        }
        updateQuestion(index, converted);
    };

    const updatePrompt = (index: number, prompt: string) => {
        updateQuestion(index, { ...questions[index], prompt });
    };

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
        if (q.options.length <= 2) return;
        const newOpts = q.options.filter((_, i) => i !== oIndex);
        if (q.type === 'multiple-choice') {
            const mc = q as MultipleChoiceQuestion;
            let newCorrect = mc.correctIndex;
            if (oIndex === newCorrect) newCorrect = 0;
            else if (oIndex < newCorrect) newCorrect--;
            updateQuestion(qIndex, { ...mc, options: newOpts, correctIndex: newCorrect });
        } else {
            const ma = q as MultipleAnswerQuestion;
            const newCorrectIndices = ma.correctIndices
                .filter((ci) => ci !== oIndex)
                .map((ci) => (ci > oIndex ? ci - 1 : ci));
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
            if (newIndices.length === 0) return; // Must have at least one correct
        } else {
            newIndices = [...q.correctIndices, oIndex].sort((a, b) => a - b);
        }
        updateQuestion(qIndex, { ...q, correctIndices: newIndices });
    };

    const addQuestion = () => {
        const maxId = questions.reduce((max, q) => Math.max(max, q.id), 0);
        setQuestions((prev) => [...prev, createBlankQuestion(maxId + 1, 'multiple-choice')]);
    };

    const deleteQuestion = (index: number) => {
        if (questions.length <= 1) return;
        setQuestions((prev) => prev.filter((_, i) => i !== index));
        setConfirmDelete(null);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveQuestions(questions);
            showToast('success', 'Questions saved successfully!');
        } catch {
            showToast('error', 'Failed to save. Please try again.');
        }
        setSaving(false);
    };

    const handleReset = () => {
        setQuestions([...defaultQuestions]);
        setConfirmReset(false);
        showToast('success', 'Reset to default questions. Click Save to persist.');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#e8edf5] via-[#dde4f0] to-[#d0d9eb]">
                <div className="text-pit-blue text-lg font-semibold animate-pulse">Loading editor…</div>
            </div>
        );
    }

    const typeLabels: Record<QuestionType, string> = {
        'multiple-choice': 'Multiple Choice',
        'multiple-answer': 'Multiple Answer',
        essay: 'Essay',
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#e8edf5] via-[#dde4f0] to-[#d0d9eb] relative">
            {/* Top yellow accent bar */}
            <div className="fixed top-0 left-0 w-full h-1.5 bg-pit-yellow z-60" />

            {/* Decorative orbs */}
            <div className="fixed top-20 left-10 w-96 h-96 bg-[#3161AC]/10 rounded-full blur-3xl pointer-events-none" />
            <div className="fixed bottom-20 right-10 w-80 h-80 bg-[#F7CC07]/10 rounded-full blur-3xl pointer-events-none" />

            {/* Sticky header */}
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

            {/* Questions */}
            <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
                {questions.map((q, qIndex) => (
                    <div
                        key={q.id}
                        className="p-6 rounded-2xl border border-white/40 bg-white/40 backdrop-blur-xl shadow-sm hover:shadow-md transition-all duration-300"
                    >
                        {/* Header row */}
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
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

                        {/* Prompt */}
                        <textarea
                            value={q.prompt}
                            onChange={(e) => updatePrompt(qIndex, e.target.value)}
                            placeholder="Enter question prompt…"
                            rows={3}
                            className="w-full px-4 py-3 rounded-xl border border-white/40 bg-white/60 text-pit-grey placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-pit-blue/30 font-body text-sm resize-y"
                        />

                        {/* Options for MC and MA */}
                        {q.type !== 'essay' && (
                            <div className="mt-4 space-y-2">
                                <p className="text-xs font-semibold text-pit-grey-light uppercase tracking-wider mb-2">
                                    {q.type === 'multiple-choice' ? 'Select the correct answer:' : 'Select all correct answers:'}
                                </p>
                                {(q as MultipleChoiceQuestion | MultipleAnswerQuestion).options.map((opt, oIndex) => (
                                    <div key={oIndex} className="flex items-center gap-2">
                                        {/* Correct indicator */}
                                        {q.type === 'multiple-choice' ? (
                                            <input
                                                type="radio"
                                                name={`correct-${q.id}`}
                                                checked={(q as MultipleChoiceQuestion).correctIndex === oIndex}
                                                onChange={() => setCorrectIndex(qIndex, oIndex)}
                                                className="w-4 h-4 accent-green-500 shrink-0"
                                            />
                                        ) : (
                                            <input
                                                type="checkbox"
                                                checked={(q as MultipleAnswerQuestion).correctIndices.includes(oIndex)}
                                                onChange={() => toggleCorrectIndex(qIndex, oIndex)}
                                                className="w-4 h-4 accent-green-500 shrink-0 rounded"
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
                                    </div>
                                ))}

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
                    </div>
                ))}

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
