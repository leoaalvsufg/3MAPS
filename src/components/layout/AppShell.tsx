import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useKeyboardShortcuts } from '@/lib/useKeyboardShortcuts';
import { KeyboardShortcutsDialog } from '@/components/onboarding/KeyboardShortcutsDialog';
import { useLlmStatusStore } from '@/stores/llm-status-store';

function AppShellInner() {
  useKeyboardShortcuts();

  useEffect(() => {
    useLlmStatusStore.getState().fetchStatus();
    useLlmStatusStore.getState().fetchOptions();
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Skip to content link — visually hidden, visible on focus */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded"
      >
        Pular para o conteúdo
      </a>

      {/* Sidebar (desktop) + Drawer (mobile) */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden" role="region" aria-label="Área principal">
        {/* Mobile header */}
        <Header />

        {/* Page content */}
        <main id="main-content" role="main" className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>

      {/* Global keyboard shortcuts dialog (triggered by '?' key) */}
      <KeyboardShortcutsDialog />
    </div>
  );
}

export function AppShell() {
  return (
    <TooltipProvider>
      <AppShellInner />
    </TooltipProvider>
  );
}
