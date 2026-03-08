// icons/index.ts
// Centralized icon setup - all Ionicons used in the application
import { addIcons } from 'ionicons';
import {
    // Editor icons
    trashOutline,
    reorderTwoOutline,
    addOutline,
    closeOutline,
    imageOutline,
    shuffleOutline,
    // Form icons
    personOutline,
    // Status icons
    checkmarkOutline,
    syncOutline,
} from 'ionicons/icons';

// Editor icons - used in TestEditor for question/option management
export const setupEditorIcons = () => {
    addIcons({
        'trash-outline': trashOutline,
        'reorder-two-outline': reorderTwoOutline,
        'add-outline': addOutline,
        'close-outline': closeOutline,
        'image-outline': imageOutline,
        'shuffle-outline': shuffleOutline,
        'checkmark-outline': checkmarkOutline,
    });
};

// Form icons - used in forms and user-related UI elements
export const setupFormIcons = () => {
    addIcons({
        'person-outline': personOutline,
    });
};

// Status icons - used for status indicators (success, loading states)
export const setupStatusIcons = () => {
    addIcons({
        'checkmark-outline': checkmarkOutline,
        'sync-outline': syncOutline,
    });
};

// Setup all icons at once
export const setupAllIcons = () => {
    addIcons({
        // Editor icons
        'trash-outline': trashOutline,
        'reorder-two-outline': reorderTwoOutline,
        'add-outline': addOutline,
        'close-outline': closeOutline,
        'image-outline': imageOutline,
        'shuffle-outline': shuffleOutline,
        // Form icons
        'person-outline': personOutline,
        // Status icons
        'checkmark-outline': checkmarkOutline,
        'sync-outline': syncOutline,
    });
};
