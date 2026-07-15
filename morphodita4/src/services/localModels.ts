import { readDir } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { ModelInfo } from '../types/api';

export async function getLocalModels(): Promise<{ models: { [key: string]: ModelInfo } }> {
  try {
    const appDir = await appDataDir();
    const modelsPath = await join(appDir, 'morphodita', 'models');
    const entries = await readDir(modelsPath);
    const models: { [key: string]: ModelInfo } = {};
    for (const entry of entries) {
      if (entry.isDirectory) {
        const name = entry.name;
        const language = name.split('-')[0] || 'unknown';
        models[name] = {
          name,
          language: language.charAt(0).toUpperCase() + language.slice(1),
          description: 'Offline model (local server)',
          capabilities: []
        };
      }
    }
    return { models };
  } catch {
    return { models: {} };
  }
}
