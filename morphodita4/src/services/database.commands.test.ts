// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATABASE_COMMANDS } from './database';

const rustHandlerSource = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');
const rustCommandsSource = readFileSync(resolve(process.cwd(), 'src-tauri/src/commands.rs'), 'utf8');
const defaultCapability = JSON.parse(readFileSync(resolve(process.cwd(), 'src-tauri/capabilities/default.json'), 'utf8')) as {
  permissions: Array<string | { identifier: string; allow?: Array<{ path: string }> }>;
};

describe('database command inventory', () => {
  // Tauri 2.6.2 command wrappers default argument_case to camelCase; keep command invoke keys unchanged.
  it('registers every frontend database command in the Tauri handler', () => {
    expect(DATABASE_COMMANDS).toHaveLength(20);
    expect(DATABASE_COMMANDS).toContain('save_wizard_results');
    expect(DATABASE_COMMANDS).toContain('word_forms_exist');
    expect(DATABASE_COMMANDS).not.toContain('word_form_exists');
    expect(DATABASE_COMMANDS).toContain('restore_database');

    for (const command of DATABASE_COMMANDS) {
      expect(rustHandlerSource).toContain(`commands::${command}`);
    }
  });

  it('does not expose removed legacy server or model-directory commands', () => {
    for (const command of [
      'start_morphodita_server',
      'stop_morphodita_server',
      'get_offline_models_dir',
    ]) {
      expect(rustHandlerSource).not.toContain(command);
      expect(rustCommandsSource).not.toContain(command);
    }
  });

  it('allows opened model files only under the existing app-data model scope', () => {
    expect(defaultCapability.permissions).toContain('fs:allow-open');
    expect(defaultCapability.permissions).toContainEqual({
      identifier: 'fs:scope',
      allow: [{ path: '$APPDATA/models' }, { path: '$APPDATA/models/**/*' }],
    });
  });
});
