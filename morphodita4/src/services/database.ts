import { invoke } from '@tauri-apps/api/core';
import type {
  DatabaseId,
  DatabasePayload,
  DatabaseRow,
  MorphologicalData,
  Session,
} from '../types/database';

type PaginationArgs = { limit?: number; offset?: number };
type SessionWritePayload = {
  operation: string;
  model: string;
  input_text: string;
  parameters: string;
  status: string;
  result_count: number;
};

type SaveWizardResultsResponse = { session_id: number; saved_count: number };

export type BackupMetadata = {
  format_version: number;
  schema_version: number;
  application_version: string;
  created_at: string;
  sessions_count: number;
  morphological_data_count: number;
};

export type RestoreResult = {
  metadata: BackupMetadata;
  rollback_path: string | null;
};

export type DatabaseCommandContract = {
  create_session: {
    args: { session: SessionWritePayload };
    result: number;
  };
  save_wizard_results: {
    args: { request: { session: SessionWritePayload; data: DatabasePayload[] } };
    result: SaveWizardResultsResponse;
  };
  get_session: { args: { id: number }; result: Session };
  get_sessions: { args: PaginationArgs; result: Session[] };
  update_session_status: {
    args: { id: number; status: string; resultCount?: number; processingTime?: number; errorMessage?: string };
    result: void;
  };
  delete_session: { args: { id: number }; result: void };
  insert_morphological_data: { args: { data: DatabasePayload[] }; result: number };
  get_morphological_data: { args: { sessionId: number }; result: MorphologicalData[] };
  search_lemmas: { args: { query: string }; result: MorphologicalData[] };
  word_form_exists: { args: { word: string }; result: boolean };
  get_all_morphological_data: { args: PaginationArgs; result: MorphologicalData[] };
  delete_sessions: { args: { ids: number[] }; result: number };
  delete_morphological_data: { args: { ids: number[] }; result: number };
  update_session: { args: { id: number; field: string; value: unknown }; result: number };
  update_morphological_data: { args: { id: number; field: string; value: unknown }; result: number };
  search_sessions: { args: { searchTerm: string; fields: string[] }; result: Session[] };
  search_morphological_data: { args: { searchTerm: string; fields: string[] }; result: MorphologicalData[] };
  backup_database: { args: { outputPath: string }; result: BackupMetadata };
  validate_backup: { args: { backupPath: string }; result: BackupMetadata };
  restore_database: { args: { backupPath: string }; result: RestoreResult };
};

export const DATABASE_COMMANDS = [
  'create_session',
  'save_wizard_results',
  'get_session',
  'get_sessions',
  'update_session_status',
  'delete_session',
  'insert_morphological_data',
  'get_morphological_data',
  'search_lemmas',
  'word_form_exists',
  'get_all_morphological_data',
  'delete_sessions',
  'delete_morphological_data',
  'update_session',
  'update_morphological_data',
  'search_sessions',
  'search_morphological_data',
  'backup_database',
  'validate_backup',
  'restore_database',
] as const satisfies ReadonlyArray<keyof DatabaseCommandContract>;
export type DatabaseErrorCode = 'NOT_IN_TAURI' | 'COMMAND_MISSING' | 'VALIDATION' | 'DATABASE';

export class DatabaseServiceError extends Error {
  constructor(
    public readonly code: DatabaseErrorCode,
    public readonly command: string,
    detail: string,
  ) {
    super(`${command}: ${detail}`);
    this.name = `${code}Error`;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotInTauriError extends DatabaseServiceError {
  constructor(command: string) {
    super('NOT_IN_TAURI', command, 'database IPC is unavailable outside the Tauri desktop runtime');
  }
}

export class CommandMissingError extends DatabaseServiceError {
  constructor(command: string, detail: string) {
    super('COMMAND_MISSING', command, detail);
  }
}

export class ValidationError extends DatabaseServiceError {
  constructor(command: string, detail: string) {
    super('VALIDATION', command, detail);
  }
}

export class DatabaseError extends DatabaseServiceError {
  constructor(command: string, detail: string) {
    super('DATABASE', command, detail);
  }
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function classifyInvokeError(command: string, error: unknown): DatabaseServiceError {
  if (error instanceof DatabaseServiceError) return error;

  const detail = errorDetail(error);
  if (/(command\s+)?(not found|not registered|unknown|missing)/i.test(detail)) {
    return new CommandMissingError(command, detail);
  }
  if (/(invalid|validation|required|malformed)/i.test(detail)) {
    return new ValidationError(command, detail);
  }
  return new DatabaseError(command, detail);
}

async function safeInvoke<Command extends keyof DatabaseCommandContract>(
  cmd: Command,
  args?: DatabaseCommandContract[Command]['args'],
): Promise<DatabaseCommandContract[Command]['result']> {
  if (!isTauriRuntime() || typeof invoke !== 'function') {
    throw new NotInTauriError(cmd);
  }

  try {
    return await invoke<DatabaseCommandContract[Command]['result']>(cmd, args);
  } catch (error) {
    throw classifyInvokeError(cmd, error);
  }
}

function parseDatabaseId(id: DatabaseId, command: string): number {
  const parsed = typeof id === 'number' ? id : Number(id);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ValidationError(command, `invalid database id: ${String(id)}`);
  }
  return parsed;
}

function parseDatabasePath(path: string, command: string): string {
  if (!path.trim()) {
    throw new ValidationError(command, 'database path is required');
  }
  return path;
}

export const DatabaseService = {
  async createSession(session: Partial<Session>): Promise<Session> {
    const sessionData = {
      operation: session.operation || 'analyze',
      model: session.model || '',
      input_text: session.input_text || '',
      parameters: JSON.stringify(session.parameters || {}),
      status: session.status || 'pending',
      result_count: session.result_count || 0,
    };
    const id = await safeInvoke('create_session', { session: sessionData });
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new ValidationError('create_session', 'Tauri returned an invalid session id');
    }
    return {
      ...sessionData,
      id: id.toString(),
      parameters: session.parameters || {},
    };
  },

  async saveWizardResults(
    session: Partial<Session>,
    data: DatabasePayload[],
  ): Promise<{ sessionId: string; savedCount: number }> {
    const sessionData: SessionWritePayload = {
      operation: session.operation || 'analyze',
      model: session.model || '',
      input_text: session.input_text || '',
      parameters: JSON.stringify(session.parameters || {}),
      status: session.status || 'pending',
      result_count: session.result_count || 0,
    };
    const response = await safeInvoke('save_wizard_results', {
      request: { session: sessionData, data },
    });
    if (!Number.isSafeInteger(response.session_id) || response.session_id <= 0) {
      throw new ValidationError('save_wizard_results', 'Tauri returned an invalid session id');
    }
    if (!Number.isSafeInteger(response.saved_count) || response.saved_count < 0 || response.saved_count > data.length) {
      throw new ValidationError('save_wizard_results', 'Tauri returned an invalid saved row count');
    }
    return { sessionId: response.session_id.toString(), savedCount: response.saved_count };
  },
  async getSession(id: string): Promise<Session> {
    return safeInvoke('get_session', { id: parseDatabaseId(id, 'get_session') });
  },

  async getSessions(limit?: number, offset?: number): Promise<Session[]> {
    return safeInvoke('get_sessions', { limit, offset });
  },

  async updateSessionStatus(
    id: string,
    status: string,
    resultCount?: number,
    processingTime?: number,
    errorMessage?: string,
  ): Promise<void> {
    await safeInvoke('update_session_status', {
      id: parseDatabaseId(id, 'update_session_status'),
      status,
      resultCount,
      processingTime,
      errorMessage,
    });
  },

  async deleteSession(id: string): Promise<void> {
    await safeInvoke('delete_session', { id: parseDatabaseId(id, 'delete_session') });
  },

  async insertMorphologicalData(data: DatabasePayload): Promise<number> {
    return safeInvoke('insert_morphological_data', { data: [data] });
  },

  async insertMorphologicalDataBatch(data: DatabasePayload[]): Promise<number> {
    return safeInvoke('insert_morphological_data', { data });
  },

  async getMorphologicalDataBySession(sessionId: string): Promise<MorphologicalData[]> {
    return safeInvoke('get_morphological_data', {
      sessionId: parseDatabaseId(sessionId, 'get_morphological_data'),
    });
  },

  async searchLemmas(query: string): Promise<MorphologicalData[]> {
    return safeInvoke('search_lemmas', { query });
  },

  async wordFormExists(word: string): Promise<boolean> {
    return safeInvoke('word_form_exists', { word });
  },

  async getAllData(
    table: 'sessions' | 'morphological_data',
    limit?: number,
    offset?: number,
  ): Promise<DatabaseRow[]> {
    if (table === 'sessions') {
      return safeInvoke('get_sessions', { limit, offset });
    }
    return safeInvoke('get_all_morphological_data', { limit, offset });
  },

  async deleteRecords(table: 'sessions' | 'morphological_data', ids: DatabaseId[]): Promise<number> {
    const normalizedIds = ids.map((id) => parseDatabaseId(id, `delete_${table}`));
    if (table === 'sessions') {
      return safeInvoke('delete_sessions', { ids: normalizedIds });
    }
    return safeInvoke('delete_morphological_data', { ids: normalizedIds });
  },

  async updateRecord(
    table: 'sessions' | 'morphological_data',
    id: DatabaseId,
    field: string,
    value: unknown,
  ): Promise<number> {
    const normalizedId = parseDatabaseId(id, `update_${table}`);
    if (table === 'sessions') {
      return safeInvoke('update_session', { id: normalizedId, field, value });
    }
    return safeInvoke('update_morphological_data', { id: normalizedId, field, value });
  },

  async searchRecords(
    table: 'sessions' | 'morphological_data',
    searchTerm: string,
    fields: string[],
  ): Promise<DatabaseRow[]> {
    if (table === 'sessions') {
      return safeInvoke('search_sessions', { searchTerm, fields });
    }
    return safeInvoke('search_morphological_data', { searchTerm, fields });
  },

  async backupDatabase(outputPath: string): Promise<BackupMetadata> {
    return safeInvoke('backup_database', {
      outputPath: parseDatabasePath(outputPath, 'backup_database'),
    });
  },

  async validateBackup(backupPath: string): Promise<BackupMetadata> {
    return safeInvoke('validate_backup', {
      backupPath: parseDatabasePath(backupPath, 'validate_backup'),
    });
  },

  async restoreDatabase(backupPath: string): Promise<RestoreResult> {
    return safeInvoke('restore_database', {
      backupPath: parseDatabasePath(backupPath, 'restore_database'),
    });
  },
};
