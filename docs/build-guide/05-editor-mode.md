# Part 5: Editor Mode (`TestEditor.tsx`)

The `TestEditor` is an interactive builder that enables teachers to create and modify questions, reorder them, and attach compressed images directly to the database.

## State Management and Initialization

The editor leverages `framer-motion` for spring-physics drag-and-drop reordering logic. It receives the `initialPayload` structured data prop passed down from `App.tsx` (which originated from `AccessCodeWall`). If this exists, the editor skips the loading screen. 

```tsx
import { Reorder } from 'framer-motion';

export default function TestEditor({ code, initialPayload }: { code: string; initialPayload?: TestDataPayload | null }) {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [config, setConfig] = useState<TestConfig>({});
    
    // ... UI State (toasts, confirmations, drag-and-drop feedback)

    useEffect(() => {
        if (initialPayload) {
            setQuestions(initialPayload.questions);
            setConfig(initialPayload.settings);
            setLoading(false);
        } else {
            // Fallback load code...
        }
    }, [initialPayload, code]);
```

## Image Compression and Storage

A core feature of the editor is the ability to attach images to question stems. To maintain security and avoid configuring public storage buckets, images are compressed and converted to Base64 data URLs right in the browser, then saved directly inside the `Question` JSON object.

We use an HTML `<canvas>` to resize the image to a maximum dimension of 800px and compress it as a JPEG at 70% quality:

```tsx
const compressImage = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                // Compress to 70% quality JPEG
                resolve(canvas.toDataURL('image/jpeg', 0.7)); 
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
}, []);
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
