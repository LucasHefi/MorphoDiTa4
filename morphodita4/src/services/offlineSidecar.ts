import { Command } from '@tauri-apps/plugin-shell';
import type { Child } from '@tauri-apps/plugin-shell';
import { validateLocalModelDirectory } from './localModels';
import { getLocalModelsDir } from './platformPaths';

const DEFAULT_PORT = 8765;
const MAX_PORT_ATTEMPTS = 5;
const READY_ATTEMPTS = 40;
const READY_DELAY_MS = 250;
const BUNDLED_MODEL_ID = 'czech-250909';
const BUNDLED_MODEL_FILE = 'czech.tagger';
const MODEL_ACKNOWLEDGEMENT = 'https://hdl.handle.net/11234/1-5985';

export const OFFLINE_RECOVERY_ACTIONS = [
  'configure-local-assets',
  'retry',
  'switch-online',
] as const;

export type OfflineRecoveryAction = (typeof OFFLINE_RECOVERY_ACTIONS)[number];
export type OfflineSidecarState = 'stopped' | 'starting' | 'ready' | 'failed' | 'stopping';

export interface OfflineSidecarStatus {
  state: OfflineSidecarState;
  port: number | null;
  baseUrl: string | null;
  diagnostics: readonly string[];
  error: string | null;
}

export class OfflineSidecarError extends Error {
  readonly code = 'OFFLINE_SIDECAR_UNAVAILABLE' as const;
  readonly recoveryActions: readonly OfflineRecoveryAction[] = OFFLINE_RECOVERY_ACTIONS;
  readonly cause?: unknown;

  constructor(detail: string, cause?: unknown) {
    super(
      `Offline mode is unavailable. Configure local assets, retry, or explicitly switch online: ${detail}`,
    );
    this.name = 'OfflineSidecarError';
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

let sidecarChild: Child | null = null;
let offlineBaseUrl: string | null = null;
let startPromise: Promise<string> | null = null;
let stopRequested = false;
let status: OfflineSidecarStatus = {
  state: 'stopped',
  port: null,
  baseUrl: null,
  diagnostics: [],
  error: null,
};

function setStatus(
  state: OfflineSidecarState,
  updates: Partial<Omit<OfflineSidecarStatus, 'state'>> = {},
): void {
  status = { ...status, ...updates, state };
}

function appendDiagnostic(message: string): void {
  const trimmed = message.trim();
  if (!trimmed) return;
  status = { ...status, diagnostics: [...status.diagnostics.slice(-49), trimmed] };
}

function formatDiagnostic(value: unknown): string {
  if (typeof value === 'string') return value;
  const serialized = JSON.stringify(value);
  return serialized ?? String(value);
}

function isAddressInUse(error: unknown): boolean {
  const values = typeof error === 'string'
    ? [error]
    : error !== null && typeof error === 'object'
      ? [
          (error as { code?: unknown }).code,
          (error as { message?: unknown }).message,
        ].filter((value): value is string => typeof value === 'string')
      : [];

  return values.some((value) => {
    const normalized = value.toLowerCase();
    return normalized.includes('eaddrinuse') || normalized.includes('address already in use');
  });
}

function joinModelPath(directory: string, fileName: string): string {
  const separator = directory.includes('\\') ? '\\' : '/';
  return `${directory.replace(/[\\/]$/, '')}${separator}${fileName}`;
}

function attachDiagnostics(command: ReturnType<typeof Command.sidecar>): void {
  command.stdout?.on('data', (line) => appendDiagnostic(`stdout: ${formatDiagnostic(line)}`));
  command.stderr?.on('data', (line) => appendDiagnostic(`stderr: ${formatDiagnostic(line)}`));
  command.on('error', (error) => appendDiagnostic(`error: ${formatDiagnostic(error)}`));
}

async function waitForReady(base: string, shouldStop: () => boolean, isAlive: () => boolean): Promise<boolean> {
  for (let attempt = 0; attempt < READY_ATTEMPTS && !shouldStop(); attempt += 1) {
    if (!isAlive()) return false;
    try {
      const response = await fetch(`${base}/models?output=json`, { method: 'GET' });
      if (response.ok) {
        const payload = await response.json() as unknown;
        if (hasRequiredBundledCapabilities(payload)) {
          return isAlive();
        }
        appendDiagnostic('readiness: response does not contain the bundled model');
        return false;
      }
    } catch (error) {
      appendDiagnostic(`readiness: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isAlive()) return false;
    await new Promise((resolve) => setTimeout(resolve, READY_DELAY_MS));
  }
  return false;
}

function hasRequiredBundledCapabilities(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false;
  const models = (payload as { models?: unknown }).models;
  if (typeof models !== 'object' || models === null || Array.isArray(models)) return false;
  for (const id of [BUNDLED_MODEL_ID, 'czech-250909-no_dia']) {
    const capabilities = (models as Record<string, unknown>)[id];
    if (!Array.isArray(capabilities) || capabilities.length !== 4 || new Set(capabilities).size !== 4) return false;
    if (!capabilities.every(c => ['tag', 'analyze', 'generate', 'tokenize'].includes(c))) return false;
  }
  return true;
}

async function killCurrentChild(): Promise<void> {
  const child = sidecarChild;
  sidecarChild = null;
  offlineBaseUrl = null;
  if (!child) return;
  try {
    await child.kill();
  } catch (error) {
    appendDiagnostic(`stop: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function startInternal(): Promise<string> {
  setStatus('starting', { baseUrl: null, port: null, error: null });
  stopRequested = false;

  try {
    const modelsPath = await getLocalModelsDir();
    const modelDirectory = joinModelPath(modelsPath, BUNDLED_MODEL_ID);
    let modelPath: string;
    try {
      const model = await validateLocalModelDirectory(modelDirectory, BUNDLED_MODEL_ID);
      if (model.manifest.id !== BUNDLED_MODEL_ID || model.manifest.artifact !== BUNDLED_MODEL_FILE) {
        throw new Error(
          `local model ${BUNDLED_MODEL_ID} has an unexpected id or artifact; reinstall the official model`,
        );
      }
      modelPath = joinModelPath(modelDirectory, model.manifest.artifact);
    } catch (error) {
      throw new OfflineSidecarError(
        `local model ${BUNDLED_MODEL_ID} is missing or invalid (${error instanceof Error ? error.message : String(error)}); open Settings and consent to the official model download`,
        error,
      );
    }

    const helperId = 'czech-250909-no_dia';
    const helperDirectory = joinModelPath(modelsPath, helperId);
    let helperPath: string;
    try {
      const helper = await validateLocalModelDirectory(helperDirectory, helperId);
      if (helper.manifest.id !== helperId || helper.manifest.artifact !== BUNDLED_MODEL_FILE) throw new Error('unexpected helper id or artifact');
      helperPath = joinModelPath(helperDirectory, helper.manifest.artifact);
    } catch (error) {
      throw new OfflineSidecarError(`local companion model ${helperId} is missing or invalid; reinstall the Czech model in Settings (${error instanceof Error ? error.message : String(error)})`, error);
    }

    for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS && !stopRequested; attempt += 1) {
      const port = DEFAULT_PORT + attempt;
      const command = Command.sidecar('binaries/morphodita-server', [
        '--log_file=',
        String(port),
        BUNDLED_MODEL_ID,
        modelPath,
        MODEL_ACKNOWLEDGEMENT,
        helperId,
        helperPath,
        MODEL_ACKNOWLEDGEMENT,
      ]);
      attachDiagnostics(command);
      let spawnedChild: Child | null = null;
      command.on('close', (event) => {
        appendDiagnostic(`close: code=${event.code ?? 'unknown'} signal=${event.signal ?? 'none'}`);
        if (sidecarChild === spawnedChild) {
          sidecarChild = null;
          offlineBaseUrl = null;
          if (status.state !== 'stopping' && status.state !== 'stopped') {
            setStatus('failed', { port, baseUrl: null, error: 'Sidecar process exited before shutdown.' });
          }
        }
      });
      try {
        spawnedChild = await command.spawn();
      } catch (error) {
        appendDiagnostic(`spawn: ${formatDiagnostic(error)}`);
        if (isAddressInUse(error)) continue;
        throw error;
      }
      sidecarChild = spawnedChild;
      const candidateBaseUrl = `http://127.0.0.1:${port}`;
      setStatus('starting', { port, baseUrl: candidateBaseUrl });
      const ready = await waitForReady(candidateBaseUrl, () => stopRequested, () => sidecarChild === spawnedChild);
      if (ready && !stopRequested && sidecarChild === spawnedChild) {
        offlineBaseUrl = candidateBaseUrl;
        setStatus('ready', { port, baseUrl: candidateBaseUrl, error: null });
        return candidateBaseUrl;
      }
      await killCurrentChild();
    }

    throw new Error(
      stopRequested
        ? 'Offline sidecar startup was cancelled.'
        : `MorphoDiTa sidecar did not become ready on ports ${DEFAULT_PORT}-${DEFAULT_PORT + MAX_PORT_ATTEMPTS - 1}`,
    );
  } catch (error) {
    await killCurrentChild();
    const detail = error instanceof Error ? error.message : String(error);
    setStatus(stopRequested ? 'stopped' : 'failed', { baseUrl: null, port: null, error: detail });
    if (error instanceof OfflineSidecarError) throw error;
    throw new OfflineSidecarError(detail, error);
  }
}

export const OfflineSidecar = {
  async start(): Promise<string> {
    if (status.state === 'ready' && offlineBaseUrl && sidecarChild) return offlineBaseUrl;
    if (startPromise) return startPromise;
    startPromise = startInternal().finally(() => {
      startPromise = null;
    });
    return startPromise;
  },

  async stop(): Promise<void> {
    stopRequested = true;
    if (startPromise) {
      setStatus('stopping');
      await killCurrentChild();
      await startPromise.catch(() => undefined);
    } else {
      setStatus('stopping');
      await killCurrentChild();
    }
    setStatus('stopped', { port: null, baseUrl: null, error: null });
  },

  async restart(): Promise<string> {
    await this.stop();
    return this.start();
  },

  getCurrentOfflineBaseUrl(): string | null {
    return offlineBaseUrl;
  },

  getStatus(): OfflineSidecarStatus {
    return { ...status, diagnostics: [...status.diagnostics] };
  },
};
