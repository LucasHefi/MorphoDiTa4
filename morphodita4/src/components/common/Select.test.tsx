import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  });

  it('renders a themed select with an explicit muted chevron', () => {
    flushSync(() => {
      root.render(
        <Select
          aria-label="Model"
          disabled
          label="Model"
          options={[{ value: 'default', label: 'Default model' }]}
        />,
      );
    });

    const select = container.querySelector('select');
    expect(select).not.toBeNull();
    expect(select?.classList.contains('text-foreground')).toBe(true);
    expect(select?.classList.contains('bg-background')).toBe(true);
    expect(select?.classList.contains('border-input')).toBe(true);
    expect(select?.classList.contains('focus-visible:ring-2')).toBe(true);
    expect(select?.classList.contains('focus-visible:ring-ring')).toBe(true);
    expect(select?.classList.contains('appearance-none')).toBe(true);
    expect(select?.classList.contains('pr-10')).toBe(true);
    expect(select?.disabled).toBe(true);

    const chevron = container.querySelector('svg[aria-hidden="true"]');
    expect(chevron).not.toBeNull();
    expect(chevron?.classList.contains('pointer-events-none')).toBe(true);
    expect(chevron?.classList.contains('text-muted-foreground')).toBe(true);
  });
});
