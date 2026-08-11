import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Badge, Button, Card, Input, ProgressBar, Select, Spinner, Tabs, TextArea } from '../components/common';
const nodeProcess = (globalThis as typeof globalThis & {
  process?: { cwd: () => string; getBuiltinModule?: (name: string) => { readFileSync: (path: string, encoding: string) => string } };
}).process;
const css = nodeProcess?.getBuiltinModule?.('fs').readFileSync(`${nodeProcess.cwd()}/src/styles/globals.css`, 'utf8') ?? '';

const requiredTokens = [
  'surface-page', 'surface-elevated', 'surface-card', 'surface-glass', 'surface-input',
  'surface-popover', 'surface-dropdown', 'text-primary', 'text-secondary', 'text-muted',
  'border-default', 'border-strong', 'focus-ring', 'selection-background', 'selection-foreground',
  'status-success', 'status-warning', 'status-error', 'status-info', 'elevation-sm', 'elevation-md',
  'elevation-lg', 'radius-sm', 'radius-md', 'radius-lg', 'space-1', 'space-2', 'space-4',
];
const colorTokens = requiredTokens.slice(0, 19);
const layoutTokens = requiredTokens.slice(19);

const readBlock = (selector: string) => {
  const match = css.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\}`));
  expect(match, `missing ${selector} token block`).not.toBeNull();
  return match?.[1] ?? '';
};

const hsl = (value: string) => {
  const [h, s, l] = value.trim().split(/\s+/).map((part) => Number.parseFloat(part));
  const hue = (h % 360 + 360) % 360 / 360;
  const saturation = s / 100;
  const lightness = l / 100;
  const channel = (n: number) => {
    const k = (n + hue * 12) % 12;
    return lightness - saturation * Math.min(lightness, 1 - lightness) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)].map((channelValue) => {
    const linear = channelValue <= 0.04045 ? channelValue / 12.92 : ((channelValue + 0.055) / 1.055) ** 2.4;
    return linear;
  });
};

const contrast = (foreground: string, background: string) => {
  const luminance = (color: number[]) => 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
  const foregroundLuminance = luminance(hsl(foreground));
  const backgroundLuminance = luminance(hsl(background));
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
};

describe('theme foundation contract', () => {
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

  it('defines the semantic layer in both color modes and maps it through @theme', () => {
    const light = readBlock(':root');
    const dark = readBlock('\\.dark');
    for (const token of colorTokens) {
      expect(light).toContain(`--${token}:`);
      expect(dark).toContain(`--${token}:`);
      expect(css).toContain(`--color-${token}:`);
    }
    for (const token of layoutTokens) {
      expect(light).toContain(`--${token}:`);
      expect(dark).toContain(`--${token}:`);
      expect(css).toContain(`--${token}:`);
    }
    expect(css).toContain('--shadow-sm: var(--elevation-sm);');
    expect(css).toContain('--shadow-md: var(--elevation-md);');
    expect(css).toContain('--shadow-lg: var(--elevation-lg);');
  });

  it('keeps required text pairs at AA contrast', () => {
    const light = readBlock(':root');
    const dark = readBlock('\\.dark');
    const pairs = [
      ['text-primary', 'surface-page'], ['text-muted', 'surface-page'],
      ['primary-foreground', 'primary'], ['destructive-foreground', 'destructive'],
      ['focus-ring', 'surface-page'],
    ];
    for (const block of [light, dark]) {
      const values = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]]));
      const resolveValue = (name: string): string => values[name]?.startsWith('var(--')
        ? resolveValue(values[name].match(/var\(--([\w-]+)\)/)?.[1] ?? '')
        : values[name];
      for (const [foreground, background] of pairs) {
        const minimum = foreground === 'focus-ring' ? 3 : 4.5;
        expect(contrast(resolveValue(foreground), resolveValue(background)), `${foreground} on ${background}`).toBeGreaterThanOrEqual(minimum);
      }
    }
  });

  it('provides readable glass fallback, selection, status, and reduced-motion contracts', () => {
    expect(css).toMatch(/\.glass[\s\S]*background-color:\s*hsl\(var\(--surface-glass-fallback\)\)/);
    expect(css).toMatch(/@supports\s*\([^)]*backdrop-filter/);
    expect(css).toMatch(/::selection[\s\S]*background-color/);
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*animation:\s*none/);
    expect(css).not.toMatch(/bg-(?:white|black)|text-(?:white|black)/);
  });

  it('renders representative controls with semantic state and non-color cues', () => {
    flushSync(() => root.render(
      <main>
        <Button isLoading>Save</Button>
        <Card glass hoverEffect>Card</Card>
        <Input label="Name" />
        <TextArea label="Notes" />
        <Select aria-label="Model" options={[{ value: 'one', label: 'One' }]} />
        <Tabs tabs={[{ id: 'one', label: 'One', content: 'Panel' }]} />
        <Badge variant="success">Ready</Badge>
        <ProgressBar progress={40} label="Progress" />
        <Spinner aria-label="Loading results" />
      </main>,
    ));
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(container.querySelector('button')?.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.querySelector('.glass')?.className).not.toContain('transition-all');
    expect(container.querySelector('[data-status="success"]')).not.toBeNull();
  });

  it('keeps motion, progress, and elevation utilities semantic', () => {
    flushSync(() => root.render(
      <>
        <Card hoverEffect>Card</Card>
        <ProgressBar progress={40} variant="striped" />
      </>,
    ));
    expect(container.querySelector('.rounded-xl')?.className).toContain('motion-safe:transition-[transform,box-shadow]');
    expect(container.querySelector('[role="progressbar"] > div')?.className).toContain('motion-safe:animate-[progress-stripes_1s_linear_infinite]');
    expect(css).toContain('@keyframes progress-stripes');
    expect(css).toContain('motion-safe\\:animate-\\[progress-stripes_1s_linear_infinite\\]');
    expect(css).toContain('--shadow-sm: var(--elevation-sm);');
    expect(css).not.toContain('--color-shadow-');
    expect(css).toContain('shadow-sm');
    expect(css).toContain('hsl(var(--status-info)');
    expect(css).not.toContain('rgba(255,255,255');
  });
});
