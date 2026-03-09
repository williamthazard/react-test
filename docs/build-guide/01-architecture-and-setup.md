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

## 5. JavaScript and React Concepts Reference

This section explains the JavaScript and React patterns you'll encounter throughout the rest of this guide. If you're already comfortable with React, skim or skip it. If you're newer to it, read it once now and refer back to it as needed — concepts are explained here and then used without re-explanation in later parts.

### What React Is

React is a JavaScript library for building user interfaces. The central idea is that your UI is composed of **components** — reusable, self-contained chunks of code that each describe a piece of the screen. When data changes, React automatically re-renders only the components that depend on that data, keeping the UI in sync without you having to manually update the DOM.

### JSX

Throughout this project you'll see code that looks like HTML inside JavaScript files. This is called **JSX** (JavaScript XML). It's a syntax extension that lets you describe UI structure in a way that looks like HTML but is actually JavaScript:

```tsx
// This is JSX — it looks like HTML but lives inside a .tsx file
return (
    <div className="p-4">
        <h1>Hello, {name}</h1>
    </div>
);
```

A few JSX-specific rules to know:
- Use `className` instead of `class` (because `class` is a reserved word in JavaScript)
- Any JavaScript expression can go inside `{ }` curly braces
- Self-closing tags must include the slash: `<img />`, `<input />`, `<ion-icon />`
- A component can only return one root element (use `<>...</>` — called a **Fragment** — to wrap multiple elements without adding an extra `<div>` to the DOM)

### Components and Props

A **component** is a function that returns JSX. It can accept data through **props** (short for "properties") — essentially function arguments that the parent passes in:

```tsx
// A component that accepts a 'name' prop
function Greeting({ name }: { name: string }) {
    return <p>Hello, {name}!</p>;
}

// Used in a parent like this:
<Greeting name="Spencer" />
```

The `{ name }` syntax in the function parameter is **destructuring** — it pulls `name` directly out of the props object rather than writing `props.name` everywhere. You'll see this pattern constantly.

### State and useState

**State** is data that belongs to a component and can change over time. When state changes, React re-renders the component to reflect the new data. You create a piece of state with the `useState` **hook**:

```tsx
const [value, setValue] = useState('');
```

This gives you two things: `value` (the current state value) and `setValue` (a function to update it). The initial value (`''` here) is only used on the first render. When you call `setValue('new value')`, React schedules a re-render with the new value.

You'll also see the **functional form** of state setters — passing a callback instead of a value directly:

```tsx
// Instead of this (can read a stale value):
setValue(value + 1);

// Do this (always reads the latest state):
setValue((prev) => prev + 1);
```

The functional form is important when the new state depends on the old state, because state updates can be batched and the direct form might read an outdated value.

A **hook** is any function that starts with `use`. Hooks are the mechanism React provides for adding stateful behavior to function components. They must always be called at the top level of a component — never inside an `if` block or a loop.

### useEffect

`useEffect` lets you run code in response to something changing — for example, loading data when a component first appears:

```tsx
useEffect(() => {
    // This code runs after the component renders
    fetchSomeData();
}, [dependency]); // Re-runs when 'dependency' changes
```

The second argument is the **dependency array**. If it's empty (`[]`), the effect runs once after the first render. If it contains variables, it re-runs whenever those variables change. If omitted entirely, it runs after every render.

### useRef

`useRef` creates a mutable container that persists across renders without causing a re-render when changed:

```tsx
const inputRef = useRef<HTMLInputElement | null>(null);
```

Unlike `useState`, updating a ref does not trigger a re-render. Refs are used for two things: holding a reference to a DOM element (so you can call `.click()` or `.focus()` on it), and storing values that need to survive re-renders but shouldn't trigger them (like a timer ID or a tracking map).

### Event Handlers

React event handlers look like HTML event attributes but use camelCase and accept functions:

```tsx
<button onClick={() => doSomething()}>Click me</button>
<input onChange={(e) => setValue(e.target.value)} />
<form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
```

`e` is the event object. `e.preventDefault()` stops the browser's default behavior (for example, preventing a form from reloading the page on submit). `e.stopPropagation()` prevents the event from bubbling up to parent elements (used in the lightbox to prevent clicking the image from closing the modal).

### Controlled Inputs

In React, form inputs are typically "controlled" — their value is stored in state and the input is kept in sync with it:

```tsx
const [text, setText] = useState('');

<input
    value={text}                        // controlled by state
    onChange={(e) => setText(e.target.value)}  // updates state on each keystroke
/>
```

This means React owns the value. The alternative (uncontrolled inputs) lets the DOM own the value, but controlled inputs are preferred because they make the current value always available in state without querying the DOM.

### TypeScript Basics

This project uses **TypeScript**, a typed superset of JavaScript. Types catch mistakes at development time rather than runtime.

```tsx
// A type annotation tells TypeScript what kind of value a variable holds
const name: string = 'Spencer';
const count: number = 5;
const isOpen: boolean = false;

// A type alias gives a name to a shape
type User = { name: string; age: number };

// A union type means "one of these"
type Role = 'student' | 'editor';

// Optional properties use ?
type Config = { randomize?: boolean };  // randomize may or may not be present

// Generic types take a type parameter (like a template)
const [items, setItems] = useState<string[]>([]);  // state holds a string array
```

When you see `as SomeType` in the code, that's a **type assertion** — it tells TypeScript "trust me, I know this value is of this type." It's used when TypeScript can't narrow the type on its own, for example when a `Question` union needs to be accessed as a `MultipleChoiceQuestion`.

### Common JavaScript Patterns

**Arrow functions** are a concise way to write functions:
```js
const double = (n) => n * 2;
const add = (a, b) => a + b;
```

**Template literals** use backticks and `${}` for string interpolation:
```js
const message = `Hello, ${name}! You scored ${score}/${total}.`;
```

**Spread operator** (`...`) copies properties or array elements:
```js
const updated = { ...original, name: 'new name' }; // copy + override one field
const newArr = [...oldArr, newItem];                // copy + append one item
```

**Optional chaining** (`?.`) safely accesses a property that might be undefined:
```js
const emails = payload?.settings?.recipientEmails; // won't throw if settings is undefined
```

**Nullish coalescing** (`??`) provides a fallback when a value is `null` or `undefined`:
```js
const emails = config.recipientEmails ?? []; // use [] if recipientEmails is not set
```

**Ternary operator** is a one-line if/else:
```js
const label = isCorrect ? 'Correct' : 'Incorrect';
// equivalent to: if (isCorrect) { label = 'Correct' } else { label = 'Incorrect' }
```

**Array.map()** transforms every element in an array and returns a new array:
```js
const doubled = [1, 2, 3].map(n => n * 2); // [2, 4, 6]
// In JSX, .map() is how you render a list of elements:
{questions.map((q) => <div key={q.id}>{q.prompt}</div>)}
```

**Array.filter()** returns a new array with only the elements that pass a test:
```js
const correct = answers.filter(a => a.isCorrect);
```

**JSON.stringify / JSON.parse** convert between JavaScript objects and JSON strings:
```js
const str = JSON.stringify({ name: 'Spencer' }); // '{"name":"Spencer"}'
const obj = JSON.parse(str);                      // { name: 'Spencer' }
```

**async/await** makes asynchronous code (like network requests) read like synchronous code:
```js
async function loadData() {
    const result = await fetch('/api/data'); // wait for this to complete
    const data = await result.json();        // then wait for this
    return data;
}
```

A **Promise** is JavaScript's way of representing a value that will be available in the future (after a network request completes, for example). `async/await` is syntactic sugar over Promises — `await` unwraps the eventual value, and any errors can be caught with `try/catch`.

---

## 6. Tailwind CSS Reference

Tailwind CSS is a **utility-first** CSS framework. Instead of writing CSS classes that describe components (`.card`, `.hero-button`), you apply small, single-purpose classes directly in your HTML/JSX that each set one CSS property. This keeps styles co-located with the markup and eliminates the need to invent class names.

### How to Read a Tailwind Class

Most Tailwind classes follow a simple pattern: `property-scale` or `property-value`.

| Class | What it does |
|---|---|
| `p-4` | `padding: 1rem` (scale step 4 = 16px) |
| `text-sm` | `font-size: 0.875rem` |
| `rounded-xl` | `border-radius: 0.75rem` |
| `bg-white` | `background-color: white` |
| `flex` | `display: flex` |
| `hidden` | `display: none` |

The scale is consistent: 1 = 4px, 2 = 8px, 3 = 12px, 4 = 16px, 6 = 24px, 8 = 32px, etc.

### Spacing, Sizing, and Layout

```
p-*   padding (all sides)      px-*  padding left/right    py-*  padding top/bottom
m-*   margin (all sides)       mx-*  margin left/right     my-*  margin top/bottom
mt-*  margin-top               mb-*  margin-bottom         ml-*  margin-left

w-*   width                    h-*   height
w-full  width: 100%            h-full  height: 100%
min-h-screen  min-height: 100vh (fill the viewport)
max-w-3xl  max-width: 48rem    mx-auto  center horizontally (margin: 0 auto)

flex            display: flex
flex-col        flex-direction: column  (stack vertically)
flex-wrap       flex-wrap: wrap
flex-1          flex: 1 (grow to fill available space)
items-center    align-items: center (cross-axis centering)
justify-center  justify-content: center (main-axis centering)
justify-between justify-content: space-between
gap-4           gap: 1rem (space between flex/grid children)
space-y-4       add margin-top: 1rem to all children except the first
shrink-0        flex-shrink: 0 (don't shrink when space is tight)
grid            display: grid
grid-cols-2     grid-template-columns: repeat(2, minmax(0, 1fr))
```

### Positioning

```
relative   position: relative (establishes a coordinate context for children)
absolute   position: absolute (positioned relative to nearest 'relative' parent)
fixed      position: fixed (relative to the viewport; stays in place when scrolling)
sticky     position: sticky (scrolls normally until a threshold, then sticks)
inset-0    top: 0; right: 0; bottom: 0; left: 0 (stretch to fill parent)
top-4      top: 1rem
z-50       z-index: 50 (controls stacking order; higher = on top)
```

Positioning is how modals, sticky headers, and overlays work. A `fixed inset-0` element covers the entire viewport. A `absolute` element with `top-0 right-0` anchors to the top-right corner of its nearest `relative` ancestor.

### Typography

```
text-xs    font-size: 0.75rem     text-sm   0.875rem    text-base  1rem
text-lg    1.125rem               text-xl   1.25rem     text-2xl   1.5rem
font-medium  font-weight: 500     font-semibold  600    font-bold  700
tracking-tight   letter-spacing: -0.025em    (tighter)
tracking-wide    letter-spacing: 0.025em     (looser)
tracking-widest  letter-spacing: 0.1em       (very loose — used for monospace codes)
leading-relaxed  line-height: 1.625          (comfortable reading line height)
uppercase        text-transform: uppercase
italic           font-style: italic
text-center      text-align: center
```

### Colors and Opacity

Color classes follow the pattern `property-color-shade`:

```
text-white          white text
text-gray-400       medium-light gray text
bg-white            white background
bg-red-500          medium red background
border-gray-200     light gray border
```

The **opacity modifier** `/` lets you apply any color at partial opacity without a separate class:

```
bg-white/40         white background at 40% opacity
border-white/20     white border at 20% opacity
text-blue-200/70    blue-200 text at 70% opacity
```

**Arbitrary values** in square brackets let you use exact values not in the Tailwind scale:

```
bg-[#3161AC]        exact hex color background
w-[90vw]            exactly 90% of viewport width
text-[15px]         exactly 15px font size
from-[#1a2a4a]      gradient start color (used with bg-gradient-to-*)
```

### Gradients

```
bg-gradient-to-br   diagonal gradient (top-left to bottom-right)
from-[#color]       gradient start color
via-[#color]        gradient middle color
to-[#color]         gradient end color
```

### Borders and Rounded Corners

```
border              add a 1px border (uses current border-color)
border-2            2px border
border-t            border on top edge only
rounded-lg          border-radius: 0.5rem
rounded-xl          border-radius: 0.75rem
rounded-2xl         border-radius: 1rem
rounded-full        border-radius: 9999px (circle or pill shape)
```

### Shadows and Visual Effects

```
shadow-sm    subtle box shadow      shadow-md   medium    shadow-xl   large
backdrop-blur-md   applies a blur filter behind a semi-transparent element
                   (the "glassmorphism" effect used throughout this app)
blur-3xl     applies a large blur to the element itself (used for decorative orbs)
opacity-0    opacity: 0 (invisible but still in DOM)
```

The glassmorphism look — frosted-glass panels — is achieved by combining a semi-transparent background (`bg-white/40`), a border (`border border-white/40`), and `backdrop-blur-xl`. The blur filters the content behind the element through the translucent surface.

### State Variants

Tailwind lets you apply classes conditionally based on interactive state by prefixing them:

```
hover:bg-white        only apply when the mouse is hovering
focus:ring-2          only apply when the element has keyboard focus
focus:outline-none    remove the browser's default focus outline
disabled:opacity-50   only apply when the element is disabled
active:scale-[0.98]   only apply while the button is being clicked
```

These can be stacked: `hover:bg-white hover:shadow-lg`.

### The `peer` Pattern

`peer` enables one element to style another based on its state. It's used for our custom checkbox:

```tsx
<input type="checkbox" className="peer sr-only" />  {/* hidden but real */}
<div className="peer-checked:bg-pit-blue" />        {/* turns blue when checkbox is checked */}
```

`sr-only` removes an element from the visual layout while keeping it accessible to screen readers and keyboard navigation. The `peer-checked:` prefix on the sibling `div` only applies its classes when the `peer` input is checked. This technique gives us full accessibility (a real checkbox that keyboards and screen readers can interact with) combined with complete visual control.

### The `group` Pattern

`group` works like `peer` but for parent-child relationships:

```tsx
<div className="group">
    <button className="opacity-0 group-hover:opacity-100">×</button>
</div>
```

The button is invisible by default and becomes visible only when the parent `div` is hovered. Used for the image remove button in the editor.

### Responsive Prefixes

Prefixing any class with `sm:` applies it only on screens wider than 640px:

```
grid-cols-1 sm:grid-cols-2    one column on mobile, two columns on tablet and up
px-4 sm:px-6                  less padding on small screens, more on larger
flex-col sm:flex-row          stack vertically on mobile, horizontally on wider screens
```

### Special Utilities

```
cursor-pointer    cursor: pointer (hand icon on hover)
cursor-grab       cursor: grab (open hand — used for drag handles)
pointer-events-none  the element can't receive mouse events (used for overlays)
resize-y          allow vertical resize only (on textareas)
object-contain    scale image to fit without cropping
whitespace-nowrap prevent text from wrapping to a new line
drop-shadow-md    CSS drop-shadow filter (works on non-rectangular elements like PNGs)
antialiased       -webkit-font-smoothing: antialiased (smoother text rendering)
animate-pulse     gentle fade in/out loop (used for loading states)
animate-spin      continuous rotation (used for loading spinners)
```
