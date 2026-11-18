import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import { AboutPage } from './AboutPage';
import { MODEL_CATALOG } from '../services/modelDownload';

describe('About license information', () => {
  it('exposes each catalog model license and source plus the separate upstream server source', () => {
    const html = renderToStaticMarkup(<MemoryRouter><AboutPage /></MemoryRouter>);
    for (const model of MODEL_CATALOG.models) {
      expect(html).toContain(model.license.url);
      expect(html).toContain(model.sourceUrl);
      expect(html).toContain(model.license.name);
    }
    expect(html).toContain('about.modelTerms');
    expect(html).toContain('https://github.com/ufal/morphodita/tree/v1.11.3');
  });
});
