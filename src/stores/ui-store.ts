import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ViewMode = 'grid' | 'list';
type SortBy = 'date' | 'title' | 'template';

interface UIStore {
  // Sidebar
  sidebarCollapsed: boolean;
  sidebarOpen: boolean; // mobile drawer
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Details panel
  detailsPanelOpen: boolean;
  setDetailsPanelOpen: (open: boolean) => void;

  // Chat panel
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  toggleChat: () => void;

  // Maps gallery
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedTags: string[];
  toggleTagFilter: (tag: string) => void;
  clearTagFilters: () => void;
  sortBy: SortBy;
  setSortBy: (sort: SortBy) => void;

  // Export dialog
  exportDialogOpen: boolean;
  setExportDialogOpen: (open: boolean) => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      sidebarOpen: false,
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      detailsPanelOpen: true,
      setDetailsPanelOpen: (open) => set({ detailsPanelOpen: open }),

      chatOpen: false,
      setChatOpen: (open) => set({ chatOpen: open }),
      toggleChat: () => set((state) => ({ chatOpen: !state.chatOpen })),

      viewMode: 'grid',
      setViewMode: (mode) => set({ viewMode: mode }),
      searchQuery: '',
      setSearchQuery: (query) => set({ searchQuery: query }),
      selectedTags: [],
      toggleTagFilter: (tag) => {
        const { selectedTags } = get();
        if (selectedTags.includes(tag)) {
          set({ selectedTags: selectedTags.filter((t) => t !== tag) });
        } else {
          set({ selectedTags: [...selectedTags, tag] });
        }
      },
      clearTagFilters: () => set({ selectedTags: [] }),
      sortBy: 'date',
      setSortBy: (sort) => set({ sortBy: sort }),

      exportDialogOpen: false,
      setExportDialogOpen: (open) => set({ exportDialogOpen: open }),
    }),
    {
      name: 'mindmap-ui',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        viewMode: state.viewMode,
        sortBy: state.sortBy,
      }),
    }
  )
);

