import { invoke } from '@tauri-apps/api/core';
import { Session, MorphologicalData } from '../types/database';

async function safeInvoke<T>(cmd: string, args?: Record<string, any>, fallback?: T): Promise<T> {
  try {
    if (typeof invoke !== 'function') throw new Error('no tauri invoke');
    return await invoke(cmd, args);
  } catch {
    return fallback as T;
  }
}

export const DatabaseService = {
  async createSession(session: Partial<Session>): Promise<Session> {
    const sessionData = {
      operation: session.operation || 'analyze',
      model: session.model || '',
      input_text: session.input_text || '',
      parameters: JSON.stringify(session.parameters || {}),
      status: session.status || 'pending',
      result_count: session.result_count || 0
    };
    const id: number = await safeInvoke('create_session', { session: sessionData }, 0);
    return { ...sessionData, id: id.toString(), parameters: session.parameters || {} } as any;
  },
 
  async getSession(id: string): Promise<Session> {
    return safeInvoke('get_session', { id: parseInt(id) }, null as any);
  },
 
  async getSessions(limit?: number, offset?: number): Promise<Session[]> {
    return safeInvoke('get_sessions', { limit, offset }, []);
  },
 
  async updateSessionStatus(id: string, status: string, resultCount?: number, processingTime?: number, errorMessage?: string): Promise<void> {
    await safeInvoke('update_session_status', { 
      id: parseInt(id), 
      status, 
      resultCount, 
      processingTime, 
      errorMessage 
    }, undefined);
  },
 
  async deleteSession(id: string): Promise<void> {
    await safeInvoke('delete_session', { id: parseInt(id) }, undefined);
  },
 
  async insertMorphologicalData(data: any): Promise<number> {
    return safeInvoke('insert_morphological_data', { data: [data] }, 0);
  },
 
  async insertMorphologicalDataBatch(data: any[]): Promise<number> {
    return safeInvoke('insert_morphological_data', { data }, 0);
  },
 
  async getMorphologicalDataBySession(sessionId: string): Promise<MorphologicalData[]> {
    return safeInvoke('get_morphological_data', { sessionId: parseInt(sessionId) }, []);
  },
 
  async searchLemmas(query: string): Promise<MorphologicalData[]> {
    return safeInvoke('search_lemmas', { query }, []);
  },
 
  async wordFormExists(word: string): Promise<boolean> {
    return safeInvoke('word_form_exists', { word }, false);
  },

  async getAllData(table: 'sessions' | 'morphological_data', limit?: number, offset?: number): Promise<any[]> {
    if (table === 'sessions') {
      return safeInvoke('get_sessions', { limit, offset }, []);
    }
    return safeInvoke('get_all_morphological_data', { limit, offset }, []);
  },

  async deleteRecords(table: string, ids: number[]): Promise<number> {
    if (table === 'sessions') {
      const result: number = await safeInvoke('delete_sessions', { ids }, 0);
      return result;
    }
    const result: number = await safeInvoke('delete_morphological_data', { ids }, 0);
    return result;
  },

  async updateRecord(table: string, id: number, field: string, value: any): Promise<void> {
    if (table === 'sessions') {
      await safeInvoke('update_session', { id, field, value }, undefined);
      return;
    }
    await safeInvoke('update_morphological_data', { id, field, value }, undefined);
  },

  async searchRecords(table: string, searchTerm: string, fields: string[]): Promise<any[]> {
    if (table === 'sessions') {
      return safeInvoke('search_sessions', { searchTerm, fields }, []);
    }
    return safeInvoke('search_morphological_data', { searchTerm, fields }, []);
  },
};
