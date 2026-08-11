import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../types/database';

const databaseMock = vi.hoisted(() => ({
  getSessions: vi.fn(),
}));

vi.mock('../services/database', () => ({ DatabaseService: databaseMock }));

import { ACTIVITY_LIMIT, orderSessionsForActivity, useDbStore } from './useDbStore';

function createSession(id: string, createdAt?: string): Session {
  return {
    id,
    operation: 'analyze',
    model: 'czech-model',
    input_text: id,
    parameters: {},
    result_count: 1,
    status: 'completed',
    created_at: createdAt,
  };
}

describe('activity session loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDbStore.setState({
      sessions: [],
      recentActivity: [],
      isLoading: false,
      error: null,
    });
  });

  it('orders activity newest first with a descending id tie-break and applies the bound', async () => {
    const sessions = [
      createSession('2', '2026-08-09T10:00:00.000Z'),
      createSession('10', '2026-08-09T10:00:00.000Z'),
      createSession('1', '2026-08-08T10:00:00.000Z'),
      createSession('3', '2026-08-07T10:00:00.000Z'),
      createSession('4', '2026-08-06T10:00:00.000Z'),
      createSession('5', '2026-08-05T10:00:00.000Z'),
    ];
    databaseMock.getSessions.mockResolvedValue(sessions);

    await useDbStore.getState().loadSessions();

    expect(databaseMock.getSessions).toHaveBeenCalledWith(ACTIVITY_LIMIT);
    expect(useDbStore.getState().recentActivity.map((session) => session.id)).toEqual(['10', '2', '1', '3', '4']);
    expect(useDbStore.getState().recentActivity).toHaveLength(ACTIVITY_LIMIT);
    expect(orderSessionsForActivity(sessions, 2).map((session) => session.id)).toEqual(['10', '2']);
  });

  it('exposes loading while the database request is pending and then exposes the empty state', async () => {
    let resolveRequest: (sessions: Session[]) => void = () => undefined;
    const request = new Promise<Session[]>((resolve) => {
      resolveRequest = resolve;
    });
    databaseMock.getSessions.mockReturnValue(request);

    const loadPromise = useDbStore.getState().loadSessions();
    expect(useDbStore.getState()).toEqual(expect.objectContaining({ isLoading: true, error: null }));

    resolveRequest([]);
    await loadPromise;

    expect(useDbStore.getState()).toEqual(expect.objectContaining({
      isLoading: false,
      error: null,
      recentActivity: [],
    }));
  });

  it('exposes a retryable error and rethrows a failed database refresh', async () => {
    const failure = new Error('database unavailable');
    databaseMock.getSessions.mockRejectedValue(failure);

    await expect(useDbStore.getState().loadSessions()).rejects.toBe(failure);

    expect(useDbStore.getState()).toEqual(expect.objectContaining({
      isLoading: false,
      error: 'database unavailable',
    }));
  });

  it('does not let an older load overwrite a newer result', async () => {
    let resolveOlder: (sessions: Session[]) => void = () => undefined;
    let resolveNewer: (sessions: Session[]) => void = () => undefined;
    const olderRequest = new Promise<Session[]>((resolve) => {
      resolveOlder = resolve;
    });
    const newerRequest = new Promise<Session[]>((resolve) => {
      resolveNewer = resolve;
    });
    const newerSessions = [createSession('newer', '2026-08-10T10:00:00.000Z')];
    const olderSessions = [createSession('older', '2026-08-09T10:00:00.000Z')];
    databaseMock.getSessions
      .mockReturnValueOnce(olderRequest)
      .mockReturnValueOnce(newerRequest);

    const olderLoad = useDbStore.getState().loadSessions();
    const newerLoad = useDbStore.getState().loadSessions();

    resolveNewer(newerSessions);
    await newerLoad;
    expect(useDbStore.getState()).toEqual(expect.objectContaining({
      sessions: newerSessions,
      recentActivity: newerSessions,
      isLoading: false,
      error: null,
    }));

    resolveOlder(olderSessions);
    await olderLoad;
    expect(useDbStore.getState()).toEqual(expect.objectContaining({
      sessions: newerSessions,
      recentActivity: newerSessions,
      isLoading: false,
      error: null,
    }));
  });

  it('does not let an older load failure replace a newer result', async () => {
    let rejectOlder: (error: Error) => void = () => undefined;
    let resolveNewer: (sessions: Session[]) => void = () => undefined;
    const olderRequest = new Promise<Session[]>((_, reject) => {
      rejectOlder = reject;
    });
    const newerRequest = new Promise<Session[]>((resolve) => {
      resolveNewer = resolve;
    });
    const newerSessions = [createSession('newer', '2026-08-10T10:00:00.000Z')];
    const olderFailure = new Error('stale database failure');
    databaseMock.getSessions
      .mockReturnValueOnce(olderRequest)
      .mockReturnValueOnce(newerRequest);

    const olderLoad = useDbStore.getState().loadSessions();
    const newerLoad = useDbStore.getState().loadSessions();

    resolveNewer(newerSessions);
    await newerLoad;
    rejectOlder(olderFailure);
    await expect(olderLoad).rejects.toBe(olderFailure);

    expect(useDbStore.getState()).toEqual(expect.objectContaining({
      sessions: newerSessions,
      recentActivity: newerSessions,
      isLoading: false,
      error: null,
    }));
  });
});
