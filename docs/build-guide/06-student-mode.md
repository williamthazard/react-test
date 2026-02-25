# Part 6: Student Mode (`TestPage.tsx`)

The `TestPage` component renders the test for students. Like the Editor, it relies on the preloaded `initialPayload` passed down from the auth screen. This payload contains both the questions array and global configuration settings (like `randomizeQuestions`).

## Initialization and Randomization

When the `TestPage` mounts, it intercepts the `TestDataPayload`. Because the payload dictates whether to randomize the global question order or the order of individual multiple-choice options, we apply a Fisher-Yates shuffle directly in the browser before rendering:

```tsx
const processPayload = (payload: TestDataPayload) => {
    let processed = [...payload.questions];
    
    // 1. Global Question Shuffle
    if (payload.settings?.randomizeQuestions) {
        processed.sort(() => Math.random() - 0.5);
    }
    
    // 2. Individual Option Shuffle
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

useEffect(() => {
    if (initialPayload) {
        processPayload(initialPayload);
    } else {
        doLoad();
    }
}, [initialPayload, code]);
```

## The Answers State Map

To keep track of student responses without mutating the original questions array, we use a simple record object mapped by Question ID.

```tsx
type Answers = Record<number, string | string[]>;
const [answers, setAnswers] = useState<Answers>({});
```

Depending on the question type, the answer value is updated differently:
- **Multiple Choice**: Replaces the explicit answer string (e.g. `answers[q.id] = "3"`).
- **Essay**: Updates the string representation of the text box.
- **Multiple Answer**: Toggles the option within an array of strings.

```tsx
const handleMultiSelect = (questionId: number, option: string) => {
    setAnswers((prev) => {
        const current = (prev[questionId] as string[]) || [];
        const updated = current.includes(option)
            ? current.filter((item) => item !== option) // Remove if exists
            : [...current, option];                     // Add if missing
        return { ...prev, [questionId]: updated };
    });
};
```

## The Interactive Lightbox

If a teacher attached an image to a question (handled in Part 5), the student sees it below the prompt text. To allow students to enlarge images without losing their place in the test, we implemented a full-screen React modal (lightbox).

**Lightbox State:**
```tsx
const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
```

**Image Thumbnail Render:**
```tsx
{q.imageUrl && (
    <img
        src={q.imageUrl}
        alt="Question image"
        onClick={() => setLightboxSrc(q.imageUrl!)}
        className="mb-5 max-w-full max-h-80 rounded-xl cursor-pointer hover:scale-[1.01] transition-all"
    />
)}
```

**Lightbox Modal (placed at the bottom of the component):**
```tsx
{lightboxSrc && (
    <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
        onClick={() => setLightboxSrc(null)} // Click outside to close
    >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <button
            onClick={() => setLightboxSrc(null)}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/20 text-white font-bold"
        >
            ×
        </button>
        <img
            src={lightboxSrc}
            alt="Enlarged"
            className="relative z-10 max-w-[90vw] max-h-[85vh] rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()} // Prevent close when clicking the image itself
        />
    </div>
)}
```

## Submitting the Test

When the student submits, the application verifies the first and last name fields are populated. It then packages the `answers` record and securely transmits it to the `sendResults` service proxy built in Part 3.

```tsx
const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
        setNameError(true);
        return;
    }
    
    try {
        setSubmitState('sending');
        const studentName = `${firstName.trim()} ${lastName.trim()}`;
        await sendResults(answers, studentName, code);
        setSubmitState('success');
    } catch (err) {
        setSubmitState('error');
        setErrorMsg(err instanceof Error ? err.message : 'Failed to send results');
    }
};
```

If successful, the component transitions to a `"success"` UI state, rendering a green checkmark and hiding the test questions, ensuring the test cannot be re-submitted.
