import { create } from 'zustand';
import { DatabaseService } from '../services/database';
import type { Session } from '../types/database';

export const ACTIVITY_LIMIT = 5;

export function orderSessionsForActivity(sessions: Session[], limit = ACTIVITY_LIMIT): Session[] {
  if (limit <= 0) return [];

  return [...sessions]
    .sort((left, right) => {
      const leftTime = left.created_at ? Date.parse(left.created_at) : Number.NEGATIVE_INFINITY;
      const rightTime = right.created_at ? Date.parse(right.created_at) : Number.NEGATIVE_INFINITY;
      const normalizedLeftTime = Number.isNaN(leftTime) ? Number.NEGATIVE_INFINITY : leftTime;
      const normalizedRightTime = Number.isNaN(rightTime) ? Number.NEGATIVE_INFINITY : rightTime;

      if (normalizedLeftTime !== normalizedRightTime) {
        return normalizedRightTime - normalizedLeftTime;
      }

      const leftId = left.id ?? '';
      const rightId = right.id ?? '';
      const leftNumericId = Number(leftId);
      const rightNumericId = Number(rightId);
      if (Number.isSafeInteger(leftNumericId) && Number.isSafeInteger(rightNumericId)) {
        return rightNumericId - leftNumericId;
      }
      if (leftId === rightId) return 0;
      return leftId > rightId ? -1 : 1;
    })
    .slice(0, limit);
}

function databaseErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface DbStore {
  sessions: Session[];
  recentActivity: Session[];
  isLoading: boolean;
  error: string | null;
  loadSessions: () => Promise<void>;
  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  removeSession: (id: string) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useDbStore = create<DbStore>((set) => ({
  sessions: [],
  recentActivity: [],
  isLoading: true,
  error: null,
  loadSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const sessions = orderSessionsForActivity(await DatabaseService.getSessions(ACTIVITY_LIMIT));
      set({ sessions, recentActivity: sessions, isLoading: false, error: null });
    } catch (error) {
      set({ isLoading: false, error: databaseErrorMessage(error) });
      throw error;
    }
  },
  setSessions: (sessions) => {
    const orderedSessions = orderSessionsForActivity(sessions, sessions.length);
    set({
      sessions: orderedSessions,
      recentActivity: orderedSessions.slice(0, ACTIVITY_LIMIT),
    });
  },
  addSession: (session) =>
    set((state) => {
      const newSessions = [session, ...state.sessions];
      return {
        sessions: newSessions,
        recentActivity: newSessions.slice(0, ACTIVITY_LIMIT),
      };
    }),
  updateSession: (id, updates) =>
    set((state) => {
      const newSessions = state.sessions.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      );
      return {
        sessions: newSessions,
        recentActivity: newSessions.slice(0, ACTIVITY_LIMIT),
      };
    }),
  removeSession: (id) =>
    set((state) => {
      const newSessions = state.sessions.filter((s) => s.id !== id);
      return {
        sessions: newSessions,
        recentActivity: newSessions.slice(0, ACTIVITY_LIMIT),
      };
    }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
