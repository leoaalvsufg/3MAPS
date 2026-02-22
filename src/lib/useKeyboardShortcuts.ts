import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '@/stores/ui-store';

/**
 * Registers global keyboard shortcuts for the application.
 *
 * Shortcuts:
 * - Ctrl/Cmd+N  → Navigate to home page (new map)
 * - Ctrl/Cmd+E  → Open export dialog
 * - Ctrl/Cmd+S  → Prevent default browser save (manual sync handled by store)
 * - Ctrl/Cmd+/  → Toggle sidebar collapsed state
 * - Escape      → Close any open dialog/panel
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setExportDialogOpen = useUIStore((s) => s.setExportDialogOpen);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;

      // Ignore shortcuts when typing in an input/textarea/select/contenteditable
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      // Ctrl/Cmd+N — new map
      if (isMod && e.key === 'n') {
        e.preventDefault();
        navigate('/');
        return;
      }

      // Ctrl/Cmd+E — open export dialog
      if (isMod && e.key === 'e') {
        e.preventDefault();
        setExportDialogOpen(true);
        return;
      }

      // Ctrl/Cmd+S — prevent browser save
      if (isMod && e.key === 's') {
        e.preventDefault();
        // Manual sync is handled by the maps store automatically; nothing extra needed here.
        return;
      }

      // Ctrl/Cmd+/ — toggle sidebar
      if (isMod && e.key === '/') {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Escape — close dialogs/panels (handled by individual components via shadcn Dialog)
      // We only handle the case where no input is focused to avoid interfering with editing.
      if (e.key === 'Escape' && !isInput) {
        setExportDialogOpen(false);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, toggleSidebar, setExportDialogOpen]);
}
