import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Spinner } from './Spinner';
import i18n from 'i18next';

const translations: Record<string, Record<string, string>> = {
  cs: { 'common.loadingLabel': 'Načítání', 'common.loading': 'Načítání...' },
  en: { 'common.loadingLabel': 'Loading', 'common.loading': 'Loading...' },
  pl: { 'common.loadingLabel': 'Ładowanie', 'common.loading': 'Ładowanie...' },
};

describe('Spinner localization', () => {
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

  it.each(['cs', 'en', 'pl'])('renders the localized loading name and status in %s', (locale) => {
    i18n.language = locale;
    i18n.emit('languageChanged', locale);
    flushSync(() => root.render(<Spinner />));
    expect(container.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe(translations[locale]['common.loadingLabel']);
    expect(container.querySelector('.sr-only')?.textContent).toBe(translations[locale]['common.loading']);
  });

  it('allows an explicit accessible label override', () => {
    i18n.language = 'en';
    i18n.emit('languageChanged', 'en');
    flushSync(() => root.render(<Spinner aria-label="Loading models" />));
    expect(container.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('Loading models');
  });
});
