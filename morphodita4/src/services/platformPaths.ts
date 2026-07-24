import { resolveResource } from '@tauri-apps/api/path';

const BUNDLED_MODELS_RESOURCE = 'models';

export async function getBundledModelsDir(): Promise<string> {
  try {
    const modelsDir = await resolveResource(BUNDLED_MODELS_RESOURCE);
    if (!modelsDir) {
      throw new Error('Tauri returned an empty bundled models resource path');
    }
    return modelsDir;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Bundled MorphoDiTa models resource is unavailable: ${detail}`);
  }
}
