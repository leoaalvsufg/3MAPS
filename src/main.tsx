import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { performStorageCleanup } from '@/lib/storageCleanup';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// On startup: verify stored token and load maps from server if authenticated.
setTimeout(async () => {
  try {
    const { useAuthStore } = await import('@/stores/auth-store');
    const { isAuthenticated } = useAuthStore.getState();
    if (isAuthenticated) {
      await useAuthStore.getState().checkAuth();
    }
  } catch {
    // ignore
  }
}, 100);

// Run storage cleanup once after a 5-second delay to avoid blocking initial render.
setTimeout(() => {
  void performStorageCleanup();
}, 5000);

// Register service worker in production only
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  setTimeout(() => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[SW] Registered:', registration.scope);
      })
      .catch((err) => {
        console.error('[SW] Registration failed:', err);
      });
  }, 0);
}
