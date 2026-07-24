import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATABASE_COMMANDS } from './database';

const rustHandlerSource = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');

describe('database command inventory', () => {
  it('registers every frontend database command in the Tauri handler', () => {
    expect(DATABASE_COMMANDS).toHaveLength(20);
    expect(DATABASE_COMMANDS).toContain('save_wizard_results');
    expect(DATABASE_COMMANDS).toContain('restore_database');

    for (const command of DATABASE_COMMANDS) {
      expect(rustHandlerSource).toContain(`commands::${command}`);
    }
  });
});
