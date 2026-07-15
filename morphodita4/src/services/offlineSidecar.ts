import { Command, Child } from '@tauri-apps/plugin-shell';
import { appDataDir, join } from '@tauri-apps/api/path';

let sidecarChild: Child | null = null;
let offlineBaseUrl: string | null = null;
const DEFAULT_PORT = 8765;

async function waitForReady(base: string, maxAttempts = 40): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const r = await fetch(`${base}/models?output=json`, { method: 'GET' });
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

export const OfflineSidecar = {
  async start(modelDir?: string): Promise<string | null> {
    if (offlineBaseUrl && sidecarChild) return offlineBaseUrl;
    try {
      const port = DEFAULT_PORT;
      const appDir = await appDataDir();
      const modelsPath = modelDir || await join(appDir, 'morphodita', 'models');
      const cmd = Command.sidecar('morphodita-server', [
        '--models-dir', modelsPath,
        '--port', String(port)
      ]);
      cmd.on('close', () => {
        sidecarChild = null;
        offlineBaseUrl = null;
      });
      sidecarChild = await cmd.spawn();
      offlineBaseUrl = `http://127.0.0.1:${port}/services/morphodita/api`;
      const ready = await waitForReady(offlineBaseUrl);
      if (!ready) {
        await this.stop();
        return null;
      }
      return offlineBaseUrl;
    } catch {
      offlineBaseUrl = null;
      sidecarChild = null;
      return null;
    }
  },
  async stop(): Promise<void> {
    if (sidecarChild) {
      try {
        await sidecarChild.kill();
      } catch {}
      sidecarChild = null;
    }
    offlineBaseUrl = null;
  },
  getCurrentOfflineBaseUrl(): string | null {
    return offlineBaseUrl;
  }
};
