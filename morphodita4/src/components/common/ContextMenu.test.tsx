import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu } from './ContextMenu';

describe('ContextMenu', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
  afterEach(() => { flushSync(() => root.unmount()); host.remove(); document.body.querySelectorAll('[role="menu"]').forEach((node) => node.remove()); });

  it('opens at the context point and restores focus after escape', () => {
    flushSync(() => root.render(<ContextMenu label="Target actions" items={[{ value: 'inspect', label: 'Inspect' }]} onSelect={vi.fn()}><button>Target</button></ContextMenu>));
    const target = host.querySelector('button') as HTMLButtonElement;
    target.focus();
    flushSync(() => target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 50 })));
    const menu = document.body.querySelector('[role="menu"]') as HTMLElement;
    expect(menu).not.toBeNull();
    expect(menu.style.left).toBe('40px');
    expect(menu.style.top).toBe('50px');
    expect(menu.getAttribute('aria-label')).toBe('Target actions');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(target);
  });

  it('opens from Shift+F10 and the ContextMenu key, then returns focus when removed', () => {
    flushSync(() => root.render(<ContextMenu label="Target actions" items={[{ value: 'inspect', label: 'Inspect' }]} onSelect={vi.fn()}><button>Target</button></ContextMenu>));
    const target = host.querySelector('button') as HTMLButtonElement;
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ left: 10, right: 110, top: 20, bottom: 60, width: 100, height: 40, x: 10, y: 20, toJSON: () => ({}) });
    target.focus();
    flushSync(() => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true })));
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(target);
    flushSync(() => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true })));
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
  });
});
