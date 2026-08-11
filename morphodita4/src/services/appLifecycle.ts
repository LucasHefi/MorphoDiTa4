import { getCurrentWindow } from '@tauri-apps/api/window';
import { OfflineSidecar } from './offlineSidecar';

export async function registerAppCloseHook(): Promise<(() => void) | null> {
  if (typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window)) {
    return null;
  }

  const appWindow = getCurrentWindow();
  return appWindow.onCloseRequested(async (event) => {
    event.preventDefault();
    try {
      await OfflineSidecar.stop();
    } finally {
      await appWindow.destroy();
    }
  });
}
