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

# Install Appwrite Web SDK
npm install appwrite
```

### Configuring Tailwind CSS

Update your `tailwind.config.js` to define our custom color palette and animations. We use a custom "PIT" brand theme:

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

## 3. Appwrite Backend Infrastructure

Log into your Appwrite Cloud console and create a new project. 

### Database Setup
1. Create a database named `test-app-db`.
2. Inside the database, create a collection named `questions`.
3. **Permissions**: Leave collection permissions completely blank. No one should be granted any read or write access here.
4. Create a single String attribute named `data` (size: 16777216 — 16MB limit to hold base64 image strings).

### API Key Generation
1. Go to "Overview" -> "Integrate with your server" -> "API Keys".
2. Create an API key named `Function Key`.
3. Grant it the following scopes:
   - `databases.read`
   - `databases.write`
   - `collections.read`
   - `collections.write`
   - `documents.read`
   - `documents.write`

Save the Project ID and the API Key. You will need these for the Serverless Functions in the next section.
