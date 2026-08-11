import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DropdownMenu } from './DropdownMenu';

describe('DropdownMenu', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
  afterEach(() => { flushSync(() => root.unmount()); host.remove(); document.body.querySelectorAll('[role="menu"]').forEach((node) => node.remove()); });

  it('opens a portal menu, activates items, and restores focus on escape/outside click', () => {
    const onSelect = vi.fn();
    flushSync(() => root.render(<DropdownMenu label="Export" items={[{ value: 'csv', label: 'CSV' }, { value: 'json', label: 'JSON' }]} onSelect={onSelect} />));
    const trigger = host.querySelector('button') as HTMLButtonElement;
    trigger.focus();
    flushSync(() => trigger.click());
    const menu = document.body.querySelector('[role="menu"]') as HTMLElement;
    expect(menu).not.toBeNull();
    expect(menu.parentElement).toBe(document.body);
    expect(menu.className).toContain('z-[100]');
    const item = menu.querySelector('[role="menuitem"]') as HTMLElement;
    flushSync(() => item.click());
    expect(onSelect).toHaveBeenCalledWith('csv');
    expect(document.activeElement).toBe(trigger);
    flushSync(() => trigger.click());
    flushSync(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    flushSync(() => trigger.click());
    flushSync(() => document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });

  it('opens at the first item with ArrowDown and at the last item with ArrowUp', () => {
    flushSync(() => root.render(<DropdownMenu label="Actions" items={[{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }, { value: 'three', label: 'Three' }]} onSelect={vi.fn()} />));
    const trigger = host.querySelector('button') as HTMLButtonElement;
    trigger.focus();
    flushSync(() => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
    let menu = document.body.querySelector('[role="menu"]') as HTMLElement;
    expect(menu.getAttribute('aria-activedescendant')).toContain('three');
    flushSync(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    flushSync(() => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    menu = document.body.querySelector('[role="menu"]') as HTMLElement;
    expect(menu.getAttribute('aria-activedescendant')).toContain('one');
  });

  it('recomputes a clamped position on resize and scroll', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 240 });
    flushSync(() => root.render(<DropdownMenu label="Actions" items={[{ value: 'one', label: 'One' }]} onSelect={vi.fn()} />));
    const trigger = host.querySelector('button') as HTMLButtonElement;
    let rect = { left: 300, right: 320, top: 200, bottom: 220, width: 20, height: 20, x: 300, y: 200, toJSON: () => ({}) };
    vi.spyOn(trigger, 'getBoundingClientRect').mockImplementation(() => rect);
    flushSync(() => trigger.click());
    const menu = document.body.querySelector('[role="menu"]') as HTMLElement;
    expect(Number.parseInt(menu.style.left, 10)).toBeLessThanOrEqual(304);
    const before = menu.style.left;
    rect = { ...rect, left: 20, right: 40, x: 20 };
    flushSync(() => window.dispatchEvent(new Event('resize')));
    expect(menu.style.left).not.toBe(before);
    const afterResize = menu.style.left;
    rect = { ...rect, left: 60, right: 80, x: 60 };
    flushSync(() => window.dispatchEvent(new Event('scroll')));
    expect(menu.style.left).not.toBe(afterResize);
  });
});
