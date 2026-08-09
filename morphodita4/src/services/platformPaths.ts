import { appDataDir, join } from '@tauri-apps/api/path';

export async function getLocalModelsDir(): Promise<string> {
  try {
    const modelsDir = await join(await appDataDir(), 'models');
    if (!modelsDir) {
      throw new Error('Tauri returned an empty local models path');
    }
    return modelsDir;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Local MorphoDiTa models directory is unavailable: ${detail}`);
  }
}
