# Part 1: Architecture and Setup

This guide will walk you through building the Assessment Test application from scratch. We'll start with the high-level architecture and initial project setup.

## 1. System Architecture

The application is a React single-page application (SPA) backed by Appwrite Cloud. It features two primary workflows:
1. **Student Mode**: Authenticate via a specific access code, load test questions, submit answers, and automatically email the results.
2. **Editor Mode**: Authenticate via a secret editor code, manage test questions, attach images, and save changes persistently.

### Security Model
Security is the cornerstone of this architecture. To prevent students from cheating (e.g., inspecting the browser network tab or GitHub source code):
- **No Public Database Access**: The Appwrite `questions` collection has empty permissions (`[]`). The client SDK cannot read or write directly.
- **Server-Mediated Access**: All database reads and writes go through a secure Serverless Function (`verify-access-code`).
- **Data URL Images**: Images are not stored as public URLs in a storage bucket. They are compressed client-side and stored as base64 strings directly in the JSON document, meaning they can only be read if the user provides a valid access code to the function.
- **Server-Side Mailing**: Email delivery happens entirely via a backend function (`send-test-results`), hiding API keys and preventing spam abuse.

## 2. Frontend Project Setup

We use Vite for an extremely fast development server and build process, React for the UI, and Tailwind CSS for styling.

### Scaffolding the Project

```bash
# Create a new Vite project with React and TypeScript
npm create vite@latest assessment-app -- --template react-ts
cd assessment-app

# Install standard dependencies
npm install

# Install Tailwind CSS v3 and its peer dependencies
npm install -D tailwindcss@3 postcss autoprefixer

# Initialize Tailwind configuration
npx tailwindcss init -p

# Install Appwrite Web SDK and Framer Motion for Drag-and-Drop
npm install appwrite framer-motion

# Install Ionicons for consistent, human-readable icons
npm install ionicons
```

### Loading the Application Fonts

The Tailwind config references two Google Fonts — **Inter** (body text) and **Outfit** (headings). Add the following `<link>` tags to the `<head>` of your `index.html` to load them:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
```

`rel="preconnect"` tells the browser to open the connection to Google's font servers as early as possible, reducing latency. `display=swap` ensures text renders immediately in a fallback font and swaps in once Inter/Outfit have loaded, preventing a flash of invisible text.

### Configuring Tailwind CSS

Update your `tailwind.config.js` to define our custom color palette and animations. We use a custom "PIT" brand theme:

The `content` array tells Tailwind which files to scan when building the final CSS bundle. Tailwind works by scanning your source files for class names and generating only the CSS that's actually used — if a file isn't listed here, any Tailwind classes it contains will be stripped from the production build. The `theme.extend` key merges our custom values into Tailwind's defaults rather than replacing them, so all built-in utilities (like `flex`, `hidden`, `rounded`) remain available alongside our custom `pit-blue`, `pit-yellow`, etc.

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'pit-blue': '#3161AC',
        'pit-blue-dark': '#1e4b8f',
        'pit-yellow': '#F7CC07',
        'pit-yellow-dark': '#dca306',
        'pit-grey': '#333333',
        'pit-grey-light': '#555555',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Outfit', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        'slide-up': 'slideUp 0.5s ease-out forwards',
        'shake': 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(15px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shake: {
          '10%, 90%': { transform: 'translate3d(-1px, 0, 0)' },
          '20%, 80%': { transform: 'translate3d(2px, 0, 0)' },
          '30%, 50%, 70%': { transform: 'translate3d(-4px, 0, 0)' },
          '40%, 60%': { transform: 'translate3d(4px, 0, 0)' }
        }
      }
    },
  },
  plugins: [],
}
```

Update your `src/index.css` to import Tailwind's directives:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply antialiased text-pit-grey bg-[#e8edf5];
  }
}
```

The three `@tailwind` directives inject Tailwind's base reset styles, any component classes, and all utility classes into the compiled CSS. The `@layer base` block lets us apply default styles to HTML elements without increasing specificity — `@apply` translates Tailwind class names into their equivalent CSS properties at build time, keeping the source readable. We set `antialiased` (smooth font rendering), `text-pit-grey` (our base text colour), and `bg-[#e8edf5]` (the light blue-grey page background) as body-level defaults.

## 3. Setting Up Ionicons

We use [Ionicons](https://ionic.io/ionicons) for consistent, readable icons throughout the application. Instead of embedding raw SVG paths in our components, Ionicons provides semantic icon names that make the code much easier to understand.

### Icon Setup File

Create `src/icons/index.ts` to centralize all icon imports:

```typescript
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
```

### TypeScript Declarations

Create `src/icons/types.d.ts` to enable TypeScript support for the `ion-icon` web component. By default, TypeScript doesn't know that `<ion-icon>` is a valid JSX element — it only knows about standard HTML tags and React components. This file teaches it:

```typescript
// types.d.ts
// TypeScript declarations for ion-icon web component in React/JSX
import 'react';

declare module 'react' {
    namespace JSX {
        interface IntrinsicElements {
            'ion-icon': React.DetailedHTMLProps<
                React.HTMLAttributes<HTMLElement> & {
                    name: string;
                    size?: 'small' | 'large';
                },
                HTMLElement
            >;
        }
    }
}
```

`declare module 'react'` reopens the existing React module declaration so we can extend it. `namespace JSX` and `interface IntrinsicElements` are where TypeScript looks to find what HTML/custom elements are valid in JSX. By adding `'ion-icon'` here with its allowed attributes (`name`, `size`, plus all standard HTML attributes), TypeScript will type-check our icon usage and provide autocomplete.

### Initialize Icons in main.tsx

Update `src/main.tsx` to define the custom element and register icons before rendering:

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setupAllIcons } from './icons'
import { defineCustomElements } from 'ionicons/loader'

// Initialize Ionicons: define custom element and register icons
defineCustomElements(window);
setupAllIcons();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

### Using Icons in Components

Once set up, you can use icons anywhere in your components with the `ion-icon` element:

```tsx
// Semantic icon usage - much more readable than raw SVG paths!
<ion-icon name="trash-outline" className="w-5 h-5" />
<ion-icon name="add-outline" className="w-4 h-4" />
<ion-icon name="checkmark-outline" className="w-3 h-3 text-white" />
```

This approach offers several benefits:
- **Readability**: `name="trash-outline"` is instantly understandable vs. cryptic SVG paths
- **Consistency**: All icons come from the same design system
- **Maintainability**: Changing an icon is a simple name swap
- **Bundle efficiency**: Only the icons you use are included

### Production CDN Scripts

For production builds, the Ionicons web component needs to be loaded via CDN scripts in `index.html`. This ensures the `<ion-icon>` custom element is properly registered before React renders:

```html
<!doctype html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <link rel="icon" type="image/png" href="/favicon.png" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Assessment Test</title>
  <script type="module" src="https://unpkg.com/ionicons@8.0.5/dist/ionicons/ionicons.esm.js"></script>
  <script nomodule src="https://unpkg.com/ionicons@8.0.5/dist/ionicons/ionicons.js"></script>
</head>

<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>

</html>
```

The two script tags handle both modern browsers (ES modules) and legacy browsers (nomodule fallback). This CDN approach ensures the web component definition is available immediately, without relying on the bundler to handle Stencil's custom element registration.

## 4. Appwrite Backend Infrastructure

Log into your Appwrite Cloud console and create a new project. 

### Database Setup
1. Create a database named `test-app-db`.
2. Inside the database, create a collection named `questions`.
3. **Permissions**: Leave collection permissions completely blank. No one should be granted any read or write access here. This is the foundation of the security model — the client SDK will be completely unable to query the database directly, even if a student inspects the network tab.
4. Create a single String attribute named `data` with a size of **16777216** (16 MB). This single attribute will hold the entire serialized JSON payload — all questions, settings, and base64-encoded images combined. 16 MB is chosen because base64 encoding inflates image data by ~33%, and we compress images to JPEG at 800px/70% quality (Part 5), keeping the total well within this limit in practice.

> **Why one big attribute instead of one document per question?** A normalized schema (one document per question) would require many separate API calls to read and write, each of which could hit a cold-start delay. By storing the entire dataset as a single JSON string in one document, every read and write is a single network round-trip. The tradeoff is that we can't query individual questions by field — but we never need to. We always load the full set.

### API Key Generation
1. Go to "Overview" → "Integrate with your server" → "API Keys".
2. Create an API key named `Function Key`.
3. Grant it the following scopes:
   - `databases.read` / `databases.write` — read and write to the database itself
   - `collections.read` / `collections.write` — read the collection schema (needed by the SDK to validate document structure)
   - `documents.read` / `documents.write` — read and write individual documents (this is the permission that actually matters at runtime)

All six scopes are needed because Appwrite's API key permission model is hierarchical — the `documents.*` operations require the parent `collections.*` and `databases.*` permissions to be granted as well. Without all six, document reads and writes will fail with a 401 error even though the API key exists.

Save the Project ID and the API Key. You will need these for the Serverless Functions in the next section.

---
