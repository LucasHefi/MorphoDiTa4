// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import cs from './cs.json';
import en from './en.json';
import pl from './pl.json';

function flatten(value: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.entries(value).reduce<Record<string, string>>((result, [key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'object' && child !== null && !Array.isArray(child)) {
      Object.assign(result, flatten(child as Record<string, unknown>, path));
    } else {
      result[path] = String(child);
    }
    return result;
  }, {});
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/{{\s*([^}]+?)\s*}}/g)].map((match) => match[1]);
}

function readSourceOrFail(relativePath: string): string {
  try {
    return readFileSync(`${process.cwd()}/src/${relativePath}`, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read locale source fixture ${relativePath}: ${String(error)}`);
  }
}

describe('locale contracts', () => {
  it('keeps CS, EN and PL key sets and interpolation placeholders in parity', () => {
    const locales = { cs: flatten(cs), en: flatten(en), pl: flatten(pl) };
    const keys = Object.keys(locales.cs).sort();

    for (const [language, values] of Object.entries(locales)) {
      expect(Object.keys(values).sort(), `${language} key set`).toEqual(keys);
    }

    for (const key of keys) {
      expect(placeholders(locales.en[key]), `${key} placeholders`).toEqual(placeholders(locales.cs[key]));
      expect(placeholders(locales.pl[key]), `${key} placeholders`).toEqual(placeholders(locales.cs[key]));
    }
  });

  it('uses i18next interpolation syntax for the About version', () => {
    const locales = { cs: flatten(cs), en: flatten(en), pl: flatten(pl) };

    for (const [language, values] of Object.entries(locales)) {
      expect(placeholders(values['about.version']), `${language} about.version`).toEqual(['version']);
      expect(values['about.version']).toMatch(/{{\s*version\s*}}/);
      expect(values['about.version']).not.toMatch(/(^|[^{}])\{version\}([^{}]|$)/);
    }
  });

  it('localizes the Wizard tagging contract error in every supported language', () => {
    const locales = { cs: flatten(cs), en: flatten(en), pl: flatten(pl) };
    for (const [language, values] of Object.entries(locales)) {
      expect(values['wizard.processing.taggingContractMismatch'], `${language} tagging contract error`).toBeTruthy();
      expect(values['wizard.summaryColumns.relations'], `${language} summary column labels`).toBeTruthy();
      expect(values['wizard.summaryColumns.forbiddenHelp'], `${language} forbidden word editor`).toBeTruthy();
    }
  });

  it('keeps scoped UI literals out of the localized components', () => {
    const files = [
      'components/wizard/WizardProcessing.tsx',
      'components/wizard/WizardSummary.tsx',
      'components/wizard/WizardResults.tsx',
      'components/analyzer/ResultPanel.tsx',
      'components/analyzer/LogPanel.tsx',
      'components/analyzer/ExportMenu.tsx',
      'components/database/DatabaseTable.tsx',
      'components/wizard/WizardInput.tsx',
      'components/common/Tabs.tsx',
      'components/common/Spinner.tsx',
    ];
    const sources = files.map(readSourceOrFail).join('\n');
    for (const literal of ['Zpracování', 'Výsledky', 'Kopírovat', 'Logs', 'Clear', 'Select all records', 'Žádná data k zobrazení', 'Token/Slovo', 'Tag / Rozbor', 'Slov:', 'Tabs', 'Loading', 'Loading...']) {
      expect(sources, literal).not.toContain(`>${literal}<`);
      expect(sources, literal).not.toContain(`"${literal}"`);
    }
    for (const key of ['common.back', 'wizard.processing.title', 'wizard.summary.title', 'wizard.results.lemmasTable', 'analyzer.results.title', 'analyzer.logs.title', 'analyzer.export.label', 'database.columns.operation']) {
      expect(flatten(cs)[key], key).toBeTruthy();
      expect(flatten(en)[key], key).toBeTruthy();
      expect(flatten(pl)[key], key).toBeTruthy();
    }
    for (const key of ['analyzer.results.morphologicalTable', 'analyzer.results.tokenTable']) {
      expect(flatten(cs)[key], key).toBeTruthy();
      expect(flatten(en)[key], key).toBeTruthy();
      expect(flatten(pl)[key], key).toBeTruthy();
    }
    for (const key of ['wizard.wordCount', 'wizard.results.tabsLabel', 'analyzer.results.tabsLabel', 'common.loadingLabel']) {
      expect(flatten(cs)[key], key).toBeTruthy();
      expect(flatten(en)[key], key).toBeTruthy();
      expect(flatten(pl)[key], key).toBeTruthy();
    }
  });
});
