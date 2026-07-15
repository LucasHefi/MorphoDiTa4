import { create } from 'zustand';
import { Session } from '../types/database';

interface DbStore {
  sessions: Session[];
  recentActivity: Session[];
  isLoading: boolean;
  error: string | null;
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
  isLoading: false,
  error: null,
  setSessions: (sessions) => 
    set({ 
      sessions, 
      recentActivity: sessions.slice(0, 5) 
    }),
  addSession: (session) => 
    set((state) => {
      const newSessions = [session, ...state.sessions];
      return { 
        sessions: newSessions,
        recentActivity: newSessions.slice(0, 5)
      };
    }),
  updateSession: (id, updates) => 
    set((state) => {
      const newSessions = state.sessions.map((s) => 
        s.id === id ? { ...s, ...updates } : s
      );
      return {
        sessions: newSessions,
        recentActivity: newSessions.slice(0, 5)
      };
    }),
  removeSession: (id) => 
    set((state) => {
      const newSessions = state.sessions.filter((s) => s.id !== id);
      return {
        sessions: newSessions,
        recentActivity: newSessions.slice(0, 5)
      };
    }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
