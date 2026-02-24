import { useState } from 'react';
import { questions, type Question } from '../data/questionsData';
import { sendResults } from '../services/emailService';

type Answers = Record<number, string>;

type SubmitState = 'idle' | 'sending' | 'success' | 'error';

export default function TestPage() {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [answers, setAnswers] = useState<Answers>({});
    const [submitState, setSubmitState] = useState<SubmitState>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [nameError, setNameError] = useState(false);

    const handleSelect = (questionId: number, value: string) => {
        setAnswers((prev) => ({ ...prev, [questionId]: value }));
    };

    const handleEssay = (questionId: number, value: string) => {
        setAnswers((prev) => ({ ...prev, [questionId]: value }));
    };

    const answeredCount = Object.keys(answers).filter((k) => answers[Number(k)]?.trim()).length;
    const progress = Math.round((answeredCount / questions.length) * 100);
    const hasName = firstName.trim() !== '' && lastName.trim() !== '';

    const handleSubmit = async () => {
        if (!hasName) {
            setNameError(true);
            // Scroll to top to show the name error
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        setNameError(false);
        setSubmitState('sending');
        setErrorMsg('');
        try {
            const studentName = `${firstName.trim()} ${lastName.trim()}`;
            await sendResults(answers, studentName);
            setSubmitState('success');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            console.error('Failed to send results:', err);
            setErrorMsg('Failed to send results. Please try again.');
            setSubmitState('error');
        }
    };

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
                            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
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

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#e8edf5] via-[#dde4f0] to-[#d0d9eb] relative">
            {/* Top yellow accent bar */}
            <div className="fixed top-0 left-0 w-full h-1.5 bg-pit-yellow z-60" />

            {/* Decorative blurred orbs for glassmorphism background */}
            <div className="fixed top-20 left-10 w-96 h-96 bg-[#3161AC]/10 rounded-full blur-3xl pointer-events-none" />
            <div className="fixed bottom-20 right-10 w-80 h-80 bg-[#F7CC07]/10 rounded-full blur-3xl pointer-events-none" />

            {/* Sticky header */}
            <header className="sticky top-0 z-50 border-b border-white/20 bg-pit-blue/90 backdrop-blur-md shadow-md">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-white font-heading tracking-tight">Assessment Test</h1>
                        <p className="text-xs text-blue-200 mt-0.5">{questions.length} questions</p>
                    </div>
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

            {/* Questions */}
            <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
                {/* Name fields */}
                <div className={`p-6 rounded-2xl border bg-white/40 backdrop-blur-xl shadow-sm transition-all duration-300 ${nameError ? 'border-red-400 ring-2 ring-red-200' : 'border-white/40'}`}>
                    <div className="flex items-center gap-3 mb-4">
                        <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-pit-blue text-white">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
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
                                    if (nameError) setNameError(false);
                                }}
                                placeholder="Enter first name"
                                className={`w-full px-4 py-3 rounded-xl bg-white/50 border text-pit-grey placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-pit-blue/30 focus:border-pit-blue transition-all ${nameError && !firstName.trim() ? 'border-red-400' : 'border-white/50'
                                    }`}
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
                                className={`w-full px-4 py-3 rounded-xl bg-white/50 border text-pit-grey placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-pit-blue/30 focus:border-pit-blue transition-all ${nameError && !lastName.trim() ? 'border-red-400' : 'border-white/50'
                                    }`}
                            />
                        </div>
                    </div>
                    {nameError && (
                        <p className="text-sm text-red-500 mt-3 animate-fade-in">Please enter both your first and last name before submitting.</p>
                    )}
                </div>

                {questions.map((q: Question) => (
                    <div
                        key={q.id}
                        className="p-6 rounded-2xl border border-white/40 bg-white/40 backdrop-blur-xl shadow-sm hover:shadow-md hover:bg-white/50 transition-all duration-300"
                    >
                        <div className="flex items-start gap-3 mb-4">
                            <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-pit-blue text-white text-sm font-bold">
                                {q.id}
                            </span>
                            <span
                                className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${q.type === 'multiple-choice'
                                    ? 'bg-pit-blue/10 text-pit-blue'
                                    : 'bg-pit-yellow/30 text-pit-yellow-dark'
                                    }`}
                            >
                                {q.type === 'multiple-choice' ? 'Multiple Choice' : 'Essay'}
                            </span>
                        </div>
                        <p className="text-pit-grey leading-relaxed mb-5 text-[15px]">{q.prompt}</p>

                        {q.type === 'multiple-choice' ? (
                            <div className="space-y-2.5">
                                {q.options.map((opt, idx) => {
                                    const letter = String.fromCharCode(65 + idx);
                                    const isSelected = answers[q.id] === opt;
                                    return (
                                        <label
                                            key={idx}
                                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all duration-200 ${isSelected
                                                ? 'border-pit-blue bg-pit-blue/5 shadow-sm'
                                                : 'border-white/50 bg-white/50 hover:border-white/80 hover:bg-white/60'
                                                }`}
                                        >
                                            <input
                                                type="radio"
                                                name={`q-${q.id}`}
                                                value={opt}
                                                checked={isSelected}
                                                onChange={() => handleSelect(q.id, opt)}
                                                className="sr-only"
                                            />
                                            <span
                                                className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${isSelected
                                                    ? 'bg-pit-blue text-white'
                                                    : 'bg-gray-100 text-pit-grey-light'
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
                        ) : (
                            <textarea
                                rows={4}
                                placeholder="Type your answer here…"
                                value={answers[q.id] || ''}
                                onChange={(e) => handleEssay(q.id, e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white/50 border border-white/50 text-pit-grey placeholder-gray-400 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-pit-blue/30 focus:border-pit-blue resize-y transition-all"
                            />
                        )}
                    </div>
                ))}

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
                                    className={`px-8 py-3 rounded-xl font-semibold tracking-wide shadow-md transition-all duration-200 cursor-pointer whitespace-nowrap ${submitState === 'sending'
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
    );
}
