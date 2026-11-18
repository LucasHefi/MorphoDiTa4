import { describe, expect, it } from 'vitest';
import {
  MAX_WIZARD_INPUT_FILE_BYTES,
  MAX_WIZARD_INPUT_BYTES,
  MAX_WIZARD_INPUT_WORDS,
  deduplicateWizardWords,
  getWizardInputError,
  getWizardInputFileError,
  getWizardInputWordCount,
  parseWizardWords,
} from './wizardInput';

describe('Wizard input limits', () => {
  it('accepts the 1,000,000-word verification boundary and rejects the next word', () => {
    const atLimit = Array(MAX_WIZARD_INPUT_WORDS).fill('word').join(' ');
    const overLimit = `${atLimit} overflow`;

    expect(getWizardInputError(atLimit)).toBeNull();
    expect(getWizardInputError(overLimit)).toEqual({
      code: 'too-many-words',
      maxWords: MAX_WIZARD_INPUT_WORDS,
    });
  });

  it('rejects TXT files above the 10 MB boundary', () => {
    expect(getWizardInputFileError(MAX_WIZARD_INPUT_FILE_BYTES)).toBeNull();
    expect(getWizardInputFileError(MAX_WIZARD_INPUT_FILE_BYTES + 1)).toEqual({
      code: 'file-too-large',
      maxBytes: MAX_WIZARD_INPUT_FILE_BYTES,
    });
  });

  it('rejects pasted UTF-8 input above the shared 10 MB boundary', () => {
    const atLimit = 'a'.repeat(MAX_WIZARD_INPUT_BYTES);
    const overLimit = `${atLimit}a`;

    expect(getWizardInputError(atLimit)).toBeNull();
    expect(getWizardInputError(overLimit)).toEqual({
      code: 'input-too-large',
      maxBytes: MAX_WIZARD_INPUT_BYTES,
    });
  });

  it('deduplicates lookup words case-insensitively while preserving first-seen values', () => {
    expect(deduplicateWizardWords(['Pes', 'pes', 'kočka', 'Pes', 'myš'])).toEqual(['Pes', 'kočka', 'myš']);
  });

  it('removes numeric characters before counting or processing', () => {
    expect(parseWizardWords('123 pes12 ٤٥kočka ² -42 č.3')).toEqual(['pes', 'kočka', 'č']);
    expect(getWizardInputWordCount('123 ٤٥ -42')).toBe(0);
  });

  it('counts the same separators that the Wizard parser accepts', () => {
    expect(getWizardInputWordCount('pes, kočka;myš\nliška')).toBe(4);
  });
});
