import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
import type { Session } from '../types/database';

const databaseMock = vi.hoisted(() => ({
  getSessions: vi.fn(),
}));

vi.mock('../services/database', () => ({ DatabaseService: databaseMock }));
vi.mock('../components/analyzer/ModelSelector', () => ({ ModelSelector: () => null }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { HomePage } from './HomePage';
import { useDbStore } from '../store/useDbStore';

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

async function flushReactUpdates(callback: () => void | Promise<void>): Promise<void> {
  let pending: void | Promise<void> = undefined;
  flushSync(() => {
    pending = callback();
  });
  await pending;
  await Promise.resolve();
}

function createSession(id: string): Session {
  return {
    id,
    operation: 'analyze',
    model: `model-${id}`,
    input_text: `input-${id}`,
    parameters: {},
    result_count: Number(id),
    status: 'completed',
    created_at: '2026-08-09T10:00:00.000Z',
  };
}

describe('HomePage activity states', () => {
  let container: HTMLDivElement;
  let root: Root;
  let previousActEnvironment: boolean | undefined;

  beforeAll(() => {
    previousActEnvironment = reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT;
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useDbStore.setState({
      sessions: [],
      recentActivity: [],
      isLoading: false,
      error: null,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await flushReactUpdates(() => root.unmount());
    container.remove();
  });

  it('renders the loading state while activity is being fetched', async () => {
    useDbStore.setState({ isLoading: true });

    await flushReactUpdates(() => {
      root.render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>,
      );
    });

    expect(container.querySelector('[role="status"]')?.textContent).toBe('home.activity.loading');
  });

  it('renders a retryable error state when activity loading fails', async () => {
    useDbStore.setState({ error: 'database unavailable' });

    await flushReactUpdates(() => {
      root.render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>,
      );
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('home.activity.error');
    expect(container.querySelector('button')?.textContent).toContain('home.activity.retry');
  });

  it('renders the empty state when no activity exists', async () => {
    await flushReactUpdates(() => {
      root.render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>,
      );
    });

    expect(container.querySelector('[role="status"]')?.textContent).toBe('home.activity.empty');
  });

  it('retries activity loading through the store contract', async () => {
    databaseMock.getSessions.mockResolvedValue([]);
    useDbStore.setState({ error: 'database unavailable' });

    await flushReactUpdates(() => {
      root.render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>,
      );
    });

    const retryButton = container.querySelector('button');
    expect(retryButton).not.toBeNull();

    await flushReactUpdates(async () => {
      retryButton?.click();
      await Promise.resolve();
    });

    expect(databaseMock.getSessions).toHaveBeenCalledWith(5);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('home.activity.empty');
  });

  it('renders a table for populated activity', async () => {
    const sessions = [createSession('2'), createSession('1')];
    useDbStore.setState({ sessions, recentActivity: sessions });

    await flushReactUpdates(() => {
      root.render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>,
      );
    });

    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(container.textContent).toContain('model-2');
    expect(container.textContent).toContain('home.table.operation');
  });

  it('navigates the analyzer link and preserves the heading hierarchy', async () => {
    const LocationProbe = () => <output data-testid="location">{useLocation().pathname}</output>;

    await flushReactUpdates(() => {
      root.render(
        <MemoryRouter>
          <HomePage />
          <LocationProbe />
        </MemoryRouter>,
      );
    });

    const headings = [...container.querySelectorAll('h1, h2, h3')];
    expect(headings.map((heading) => heading.tagName)).toEqual(['H1', 'H2', 'H2', 'H2']);
    const analyzerLink = [...container.querySelectorAll('a')].find((link) => link.textContent?.includes('home.analyzer.title'));
    expect(analyzerLink?.getAttribute('href')).toBe('/analyzer');
    analyzerLink?.focus();
    expect(document.activeElement).toBe(analyzerLink);
    analyzerLink?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe('/analyzer');
  });
});
