import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Select } from './Select';

describe('Select', () => {
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
    document.body.querySelectorAll('[role="listbox"]').forEach((node) => node.remove());
  });

  it('uses a themed button and portal listbox, never a native select', () => {
    flushSync(() => root.render(<Select aria-label="Model" label="Model" value="one" options={[{ value: 'one', label: 'One' }]} />));
    const trigger = container.querySelector('button[aria-haspopup="listbox"]');
    expect(container.querySelector('select')).toBeNull();
    expect(trigger?.className).toContain('bg-popover');
    expect(trigger?.className).toContain('border-dropdown');
    expect(trigger?.textContent).toContain('One');
    flushSync(() => trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const listbox = document.body.querySelector('[role="listbox"]') as HTMLElement;
    expect(listbox).not.toBeNull();
    expect(trigger?.getAttribute('aria-controls')).toBe(listbox.id);
    expect(listbox.getAttribute('aria-labelledby')).toBe(trigger?.id);
    expect(listbox.getAttribute('aria-activedescendant')).toBe(`${listbox.id}-option-one`);
    expect(document.body.querySelector('[role="option"]')?.getAttribute('aria-selected')).toBe('true');
    expect(document.body.querySelector('[role="option"]')?.getAttribute('tabindex')).toBe('-1');
  });

  it('supports keyboard navigation, typeahead, selection, and focus return', () => {
    const onValueChange = vi.fn();
    flushSync(() => root.render(<Select aria-label="Model" defaultValue="one" onValueChange={onValueChange} options={[
      { value: 'one', label: 'One' }, { value: 'two', label: 'Two' }, { value: 'three', label: 'Three' },
    ]} />));
    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
    trigger.focus();
    flushSync(() => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    const listbox = document.body.querySelector('[role="listbox"]') as HTMLElement;
    flushSync(() => listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(listbox.getAttribute('aria-activedescendant')).toBe(`${listbox.id}-option-two`);
    expect(listbox.querySelector('[data-value="two"]')).not.toBeNull();
    expect(listbox.querySelector('[data-value="one"]')?.getAttribute('aria-selected')).toBe('true');
    expect(listbox.querySelector('[data-value="two"]')?.getAttribute('aria-selected')).toBe('false');
    flushSync(() => listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(listbox.getAttribute('aria-activedescendant')).toBe(`${listbox.id}-option-three`);
    expect(listbox.querySelector('[data-value="three"]')).not.toBeNull();
    flushSync(() => listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(onValueChange).toHaveBeenCalledWith('three');
    expect(document.activeElement).toBe(trigger);
    flushSync(() => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
    flushSync(() => (document.body.querySelector('[role="listbox"]') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true })));
    expect(document.body.querySelector('[role="listbox"] [data-value="two"]')).not.toBeNull();
    flushSync(() => document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
  });

  it('links label and error accessibly and honors disabled', () => {
    flushSync(() => root.render(<Select id="model" label="Model" aria-describedby="hint" error="Choose a model" disabled options={[{ value: 'one', label: 'One' }]} />));
    const trigger = container.querySelector('button') as HTMLButtonElement;
    expect(container.querySelector('label')?.htmlFor).toBe('model');
    expect(trigger.disabled).toBe(true);
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    expect(trigger.getAttribute('aria-describedby')).toBe('hint model-error');
    expect(trigger.getAttribute('aria-labelledby')).toBeNull();
    trigger.click();
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
  });

  it('skips disabled options and follows mouse highlighting without changing selection', () => {
    flushSync(() => root.render(<Select defaultValue="one" options={[{ value: 'one', label: 'One' }, { value: 'blocked', label: 'Blocked', disabled: true }, { value: 'three', label: 'Three' }]} />));
    const trigger = container.querySelector('button') as HTMLButtonElement;
    flushSync(() => trigger.click());
    const listbox = document.body.querySelector('[role="listbox"]') as HTMLElement;
    flushSync(() => listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(listbox.getAttribute('aria-activedescendant')).toBe(`${listbox.id}-option-three`);
    const three = listbox.querySelector('[data-value="three"]') as HTMLElement;
    flushSync(() => three.dispatchEvent(new MouseEvent('mousemove', { bubbles: true })));
    expect(listbox.getAttribute('aria-activedescendant')).toBe(`${listbox.id}-option-three`);
    expect(listbox.querySelector('[data-value="one"]')?.getAttribute('aria-selected')).toBe('true');
    expect(listbox.querySelector('[data-value="blocked"]')?.getAttribute('tabindex')).toBe('-1');
  });
});
