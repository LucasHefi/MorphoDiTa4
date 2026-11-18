import { invoke } from '@tauri-apps/api/core';
export interface DashboardDay { day: string; analyzer: number; wizard: number; legacy: number; runs: number }
export interface DashboardSnapshot { day: string; forms: number; lemmas: number; bytes: number }
export interface DashboardTerm { term: string; count: number }
export interface DashboardData {
  start: string; end: string; words: number; runs: number; forms: number; lemmas: number; bytes: number;
  daily: DashboardDay[]; history: DashboardSnapshot[];
  frequent_forms: DashboardTerm[]; frequent_lemmas: DashboardTerm[];
  recent: { workflow?: string; id: number; operation: string; model: string; words: number; status: string; created_at: string }[];
}
export const DashboardService = { get: (days: number) => invoke<DashboardData>('get_dashboard', { days }) };
