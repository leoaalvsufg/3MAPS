import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, ChatSession } from '@/types/chat';

interface ChatStore {
  sessions: Record<string, ChatSession>;
  isLoading: boolean;

  getSession: (mapId: string) => ChatSession | undefined;
  addMessage: (mapId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => string;
  updateMessage: (mapId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  clearSession: (mapId: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      sessions: {},
      isLoading: false,

      getSession: (mapId) => get().sessions[mapId],

      addMessage: (mapId, message) => {
        const id = uuidv4();
        const now = new Date().toISOString();
        const newMessage: ChatMessage = { ...message, id, timestamp: now };

        set((state) => {
          const existing = state.sessions[mapId];
          if (existing) {
            return {
              sessions: {
                ...state.sessions,
                [mapId]: {
                  ...existing,
                  messages: [...existing.messages, newMessage],
                  updatedAt: now,
                },
              },
            };
          }
          return {
            sessions: {
              ...state.sessions,
              [mapId]: {
                mapId,
                messages: [newMessage],
                createdAt: now,
                updatedAt: now,
              },
            },
          };
        });

        return id;
      },

      updateMessage: (mapId, messageId, updates) => {
        set((state) => {
          const session = state.sessions[mapId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [mapId]: {
                ...session,
                messages: session.messages.map((m) =>
                  m.id === messageId ? { ...m, ...updates } : m
                ),
              },
            },
          };
        });
      },

      clearSession: (mapId) => {
        set((state) => {
          const { [mapId]: _, ...rest } = state.sessions;
          return { sessions: rest };
        });
      },

      setLoading: (loading) => set({ isLoading: loading }),
    }),
    {
      name: 'mindmap-chat',
      partialize: (state) => ({ sessions: state.sessions }),
    }
  )
);

