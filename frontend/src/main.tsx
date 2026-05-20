import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

// In dev, proactively unregister any leftover PWA service workers from earlier
// builds — without this they serve cached bundles forever and code changes
// appear to do nothing.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => registrations.forEach((r) => r.unregister()))
    .catch(() => {
      /* best-effort cleanup */
    });
}

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
