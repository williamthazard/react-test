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
