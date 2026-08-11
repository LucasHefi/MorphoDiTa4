import { describe, expect, it } from 'vitest';

const sources = import.meta.glob('../**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const source = (relativePath: string) => sources[`../${relativePath}`];

describe('responsive composition contracts', () => {
  it('keeps route pages in the shared shell instead of nesting viewport shells', () => {
    for (const page of [
      'pages/AnalyzerPage.tsx',
      'pages/WizardPage.tsx',
      'pages/HomePage.tsx',
      'pages/SettingsPage.tsx',
      'pages/DatabaseEditorPage.tsx',
      'pages/AboutPage.tsx',
    ]) {
      expect(source(page), page).not.toContain('min-h-screen');
    }
  });

  it('centers every bounded route shell', () => {
    for (const page of [
      'pages/AnalyzerPage.tsx',
      'pages/WizardPage.tsx',
      'pages/HomePage.tsx',
      'pages/SettingsPage.tsx',
      'pages/DatabaseEditorPage.tsx',
      'pages/AboutPage.tsx',
    ]) {
      expect(source(page), page).toMatch(/<main className="[^"\n]*\bcontainer\b[^"\n]*\bmax-w-[^"\n]*\bmx-auto\b/);
    }
  });

  it('uses responsive bounded surfaces rather than brittle exact height locks', () => {
    for (const component of [
      'pages/AnalyzerPage.tsx',
      'components/analyzer/LogPanel.tsx',
      'components/wizard/WizardInput.tsx',
      'components/wizard/WizardProcessing.tsx',
      'components/wizard/WizardResults.tsx',
      'components/wizard/WizardSummary.tsx',
      'components/database/DatabaseTable.tsx',
    ]) {
      expect(source(component), component).not.toMatch(/(?:h|min-h|max-h)-\[(?:250|300|400|600)px\]/);
    }
  });

  it('keeps route and wizard animation opt-in for motion-safe users', () => {
    for (const page of [
      'pages/AnalyzerPage.tsx',
      'pages/WizardPage.tsx',
      'pages/HomePage.tsx',
      'pages/SettingsPage.tsx',
      'pages/DatabaseEditorPage.tsx',
      'pages/AboutPage.tsx',
      'components/wizard/WizardInput.tsx',
      'components/wizard/WizardResults.tsx',
      'components/wizard/WizardSummary.tsx',
    ]) {
      expect(source(page), page).not.toMatch(/(?:className="|className=\{`)[^\n]*animate-in(?![^\n]*motion-safe:)/);
    }
    expect(source('components/wizard/WizardStepper.tsx')).not.toContain('transition-all');
    expect(source('pages/SettingsPage.tsx')).not.toContain('transition-all');
  });

  it('exposes the Analyzer hierarchy and scroll boundaries', () => {
    const analyzer = source('pages/AnalyzerPage.tsx');
    expect(analyzer).toMatch(/<h1[^>]*>\{t\('home\.analyzer\.title'\)\}<\/h1>/);
    expect(analyzer).not.toContain("<h2 className=\"text-xl font-semibold mb-4 text-foreground\">{t('home.analyzer.title')}</h2>");
    expect(analyzer).toContain('xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]');
    expect(analyzer).toContain('minmax(0,1fr)');
    expect(analyzer).toContain('motion-safe:');
    expect(source('components/analyzer/LogPanel.tsx')).toContain('<details');
    expect(source('components/analyzer/ResultPanel.tsx')).toMatch(/overflow-[xy]-auto/);
    expect(source('components/analyzer/ResultPanel.tsx')).toMatch(/role=.*status/);
  });

  it('uses semantic wizard steps and responsive database controls', () => {
    const stepper = source('components/wizard/WizardStepper.tsx');
    expect(stepper).toContain('<ol');
    expect(stepper).toContain('<li');
    expect(stepper).toContain("aria-current={isCurrent ? 'step' : undefined}");
    expect(stepper).toContain("t('home.wizard.title')");
    expect(stepper).toContain("t('common.success')");
    expect(source('pages/DatabaseEditorPage.tsx')).toContain('aria-live="polite"');
    expect(source('pages/DatabaseEditorPage.tsx')).toContain('w-full');
    expect(source('pages/DatabaseEditorPage.tsx')).toContain("aria-label={t('common.cancel')}");
    expect(source('pages/DatabaseEditorPage.tsx')).toContain('<Search aria-hidden="true"');
  });
});
