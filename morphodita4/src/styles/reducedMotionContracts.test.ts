import { describe, expect, it } from 'vitest';

describe('reduced-motion contract', () => {
  it('disables motion for elements and pseudo-elements and enables automatic scrolling', () => {
    const nodeProcess = process as typeof process & { getBuiltinModule?: (name: string) => { readFileSync: (path: string, encoding: string) => string } };
    const css = nodeProcess.getBuiltinModule?.('fs')?.readFileSync(`${nodeProcess.cwd()}/src/styles/globals.css`, 'utf8') ?? '';
    const block = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}\s*$/)?.[1] ?? '';
    expect(block).toContain('*, *::before, *::after');
    expect(block).toMatch(/animation:\s*none\s*!important/);
    expect(block).toMatch(/transition:\s*none\s*!important/);
    expect(block).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });
});
