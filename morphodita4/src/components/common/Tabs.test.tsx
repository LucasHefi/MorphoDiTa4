import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

describe('Tabs keyboard behavior', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
  });

  it.each([
    ['ArrowRight', 1], ['ArrowLeft', 2], ['Home', 0], ['End', 2],
  ] as const)('moves focus and selection with %s', (key, expectedIndex) => {
    const onTabChange = vi.fn();
    flushSync(() => root.render(<Tabs ariaLabel="Localized tabs" onTabChange={onTabChange} tabs={[
      { id: 'one', label: 'One', content: 'One panel' },
      { id: 'two', label: 'Two', content: 'Two panel' },
      { id: 'three', label: 'Three', content: 'Three panel' },
    ]} />));

    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    tabs[0].focus();
    if (key === 'ArrowLeft') tabs[0].focus();
    flushSync(() => { tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });

    expect(document.activeElement).toBe(tabs[expectedIndex]);
    expect(tabs[expectedIndex].getAttribute('aria-selected')).toBe('true');
    if (expectedIndex !== 0 || key !== 'Home') {
      expect(onTabChange).toHaveBeenCalledWith(tabs[expectedIndex].id.replace('-tab', ''));
    }
  });

  it('uses the caller-provided accessible tablist label', () => {
    flushSync(() => root.render(<Tabs ariaLabel="Localized result views" tabs={[{ id: 'one', label: 'One', content: 'Panel' }]} />));
    expect(container.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Localized result views');
  });

  it('selects a valid replacement when the active tab is removed', async () => {
    const onTabChange = vi.fn();
    flushSync(() => root.render(<Tabs onTabChange={onTabChange} defaultTabId="two" tabs={[
      { id: 'one', label: 'One', content: 'One panel' },
      { id: 'two', label: 'Two', content: 'Two panel' },
    ]} />));
    flushSync(() => root.render(<Tabs onTabChange={onTabChange} defaultTabId="two" tabs={[{ id: 'one', label: 'One', content: 'One panel' }]} />));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector('[aria-selected="true"]')?.id).toBe('one-tab');
    expect(container.textContent).toContain('One panel');
    expect(onTabChange).toHaveBeenCalledWith('one');
  });

  it('renders no panel when all tabs are removed', () => {
    flushSync(() => root.render(<Tabs tabs={[{ id: 'one', label: 'One', content: 'One panel' }]} />));
    flushSync(() => root.render(<Tabs tabs={[]} />));
    expect(container.querySelector('[role="tabpanel"]')).toBeNull();
  });
});
