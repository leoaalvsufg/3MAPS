// Suprime ResizeObserver loop (aviso benigno do navegador ao redimensionar mapa/canvas)
if (typeof window !== 'undefined') {
  const roHandler = (e: ErrorEvent) => {
    const msg = (e?.message ?? e?.error?.message ?? '') + '';
    if (/ResizeObserver loop/i.test(msg)) {
      e.stopImmediatePropagation?.();
      e.preventDefault?.();
      return true;
    }
    return false;
  };
  window.addEventListener('error', roHandler, { capture: true });
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { performStorageCleanup } from '@/lib/storageCleanup';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

try {
  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
} catch (err) {
  rootEl.innerHTML = `
    <div style="padding:24px;font-family:system-ui,sans-serif;max-width:600px;margin:40px auto">
      <h1 style="color:#b91c1c">Erro ao iniciar</h1>
      <pre style="background:#fef2f2;padding:16px;border-radius:8px;overflow:auto;font-size:13px">${String(err instanceof Error ? err.message : err)}</pre>
      <button onclick="location.reload()" style="margin-top:16px;padding:8px 16px;cursor:pointer">Recarregar</button>
    </div>
  `;
  console.error(err);
}

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
