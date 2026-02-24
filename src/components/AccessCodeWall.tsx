import { useState, useEffect, type FormEvent } from 'react';

const APPWRITE_ENDPOINT = 'https://nyc.cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = '699de9370020d5f42bdf';
const VERIFY_FUNCTION_ID = '699df29119e0c5e74963';

interface AccessCodeWallProps {
    onUnlock: () => void;
}

export default function AccessCodeWall({ onUnlock }: AccessCodeWallProps) {
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [shake, setShake] = useState(false);
    const [checking, setChecking] = useState(false);

    // Warm up the Appwrite function container in the background
    useEffect(() => {
        fetch(`${APPWRITE_ENDPOINT}/functions/${VERIFY_FUNCTION_ID}/executions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Appwrite-Project': APPWRITE_PROJECT_ID,
            },
            body: JSON.stringify({
                async: true, // Async execution immediately returns 202 while booting container
                body: JSON.stringify({ code: 'WARM_UP' }),
            }),
        }).catch(() => { });
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!code.trim() || checking) return;

        setChecking(true);
        setError('');

        let retryCount = 0;
        const maxRetries = 3;
        let success = false;
        let valid = false;

        while (retryCount < maxRetries && !success) {
            try {
                const response = await fetch(
                    `${APPWRITE_ENDPOINT}/functions/${VERIFY_FUNCTION_ID}/executions`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Appwrite-Project': APPWRITE_PROJECT_ID,
                        },
                        body: JSON.stringify({
                            body: JSON.stringify({ code: code.trim() }),
                        }),
                    }
                );

                if (!response.ok) {
                    throw new Error(`Verification request failed with status ${response.status}`);
                }

                const result = await response.json();

                // If it timed out internally on Appwrite (e.g., status 500 or 408)
                if (result.status === 'failed') {
                    throw new Error('Appwrite execution failed (cold start timeout)');
                }

                if (result.responseBody) {
                    try {
                        const parsed = JSON.parse(result.responseBody);
                        valid = parsed.valid === true;
                        success = true; // Succeeded parsing response
                    } catch {
                        throw new Error('Invalid response body format');
                    }
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
                // Wait 1 second before retrying
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        if (success) {
            if (valid) {
                onUnlock();
            } else {
                setError('Invalid access code. Please try again.');
                setShake(true);
                setTimeout(() => setShake(false), 500);
            }
        }
        setChecking(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a2a4a] via-[#253d6e] to-[#1e3058] px-4 relative overflow-hidden">
            {/* Top yellow accent */}
            <div className="absolute top-0 left-0 w-full h-1.5 bg-pit-yellow z-20" />

            {/* Decorative blurred orbs — PIT palette */}
            <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-[#3161AC]/30 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#3161AC]/20 rounded-full blur-3xl" />
            <div className="absolute top-1/2 right-1/3 w-48 h-48 bg-[#F7CC07]/10 rounded-full blur-3xl" />
            <div className="absolute bottom-1/3 left-1/3 w-64 h-64 bg-[#2050a0]/25 rounded-full blur-3xl" />

            <div
                className={`relative z-10 w-full max-w-md p-8 rounded-2xl border border-white/15 bg-white/10 backdrop-blur-xl shadow-2xl transition-transform ${shake ? 'animate-shake' : ''
                    }`}
            >
                {/* PIT Logo */}
                <div className="flex justify-center mb-6">
                    <div className="w-24 h-24 rounded-2xl bg-white p-3 flex items-center justify-center shadow-xl shadow-white/20 ring-1 ring-white/20">
                        <img
                            src={`${import.meta.env.BASE_URL}PIT_logo_blue.png`}
                            alt="Pennsylvania Institute of Technology"
                            className="w-full h-full object-contain"
                        />
                    </div>
                </div>

                <h1 className="text-2xl font-bold text-center text-white font-heading tracking-tight">
                    Access Required
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
