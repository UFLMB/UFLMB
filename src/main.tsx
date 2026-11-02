import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Keep the initial React render independent from the full stylesheet download.
// Critical above-the-fold styles are in index.html; the complete theme loads immediately after mount.
void import('./index.css').catch(() => {
  // The inline critical styles keep the initial page readable if the stylesheet request fails.
})

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline support is an enhancement; the app remains usable without a service worker.
    })
  })
}
