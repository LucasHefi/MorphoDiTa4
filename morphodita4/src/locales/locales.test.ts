import { describe, expect, it } from 'vitest';
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
});
