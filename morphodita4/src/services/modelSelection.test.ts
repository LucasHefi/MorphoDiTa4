import { describe, expect, it } from 'vitest';
import { selectAvailableModel } from './modelSelection';

const models = {
  'english-model': {},
  'czech-pdt-model': {},
};

describe('selectAvailableModel', () => {
  it('keeps a selected model that is still available', () => {
    expect(selectAvailableModel(models, 'english-model')).toBe('english-model');
  });

  it('replaces an unavailable model with the preferred Czech model', () => {
    expect(selectAvailableModel(models, 'offline-only-model')).toBe('czech-pdt-model');
  });

  it('uses the first model when no Czech model is available', () => {
    expect(selectAvailableModel({ 'english-model': {}, 'polish-model': {} }, null)).toBe('english-model');
  });

  it('returns null when no model is available', () => {
    expect(selectAvailableModel({}, 'stale-model')).toBeNull();
  });
});
