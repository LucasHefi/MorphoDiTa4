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
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          OfflineSidecar.stop(),
          new Promise<void>((resolve) => { timeout = setTimeout(resolve, 3000); }),
        ]);
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
    } finally {
      await appWindow.destroy();
    }
  });
}
