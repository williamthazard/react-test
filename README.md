# Assessment Test Platform

A secure, serverless React application for administering exams and aggregating results. Built with React, TypeScript, and Vite, and backed by Appwrite Cloud.

## Architecture

This application uses a sophisticated security model that mediates all database reads and writes through secure, server-side Appwrite Functions. The client SDK is deliberately restricted from accessing the `questions` collection directly.

Features two core modes:
1. **Student Mode**: Authenticates via an access code, loads the latest question payload, auto-grades multiple-choice/multiple-answer structures, and triggers a serverless function to email the final exam results securely.
2. **Editor Mode**: Authenticates via a master password, providing a full rich-text drag-and-drop React UI to manage exam questions, attach and aggressively compress base64 images, and dispatch the updated payload to the database.

## Technologies Used

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS v3, Framer Motion (spring-physics animations)
- **Icons**: Ionicons
- **Backend**: Appwrite Cloud (Serverless Functions, Documents API)

## Getting Started

To run the application locally:

```bash
# Install all dependencies
npm install

# Start the Vite development server
npm run dev
```

For full deployment instructions and backend Appwrite initialization, refer to the included Build Guide markdown files in the `docs` folder.
