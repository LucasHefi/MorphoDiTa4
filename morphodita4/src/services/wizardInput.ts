import { parseInputText, removeDuplicates } from './filters';

export const MAX_WIZARD_INPUT_WORDS = 1_000_000;
export const MAX_WIZARD_INPUT_BYTES = 10_000_000;
export const MAX_WIZARD_INPUT_FILE_BYTES = MAX_WIZARD_INPUT_BYTES;

export type WizardInputError =
  | { code: 'too-many-words'; maxWords: number }
  | { code: 'input-too-large'; maxBytes: number }
  | { code: 'file-too-large'; maxBytes: number }
  | { code: 'file-read-failed' };

/** Digits are never sent to linguistic processing. Keep the original text for review. */
export function removeWizardDigits(text: string): string {
  return text.replace(/\p{N}/gu, '');
}

export function parseWizardWords(text: string): string[] {
  return parseInputText(removeWizardDigits(text)).filter((word) => /\p{L}/u.test(word));
}

export function getWizardInputWordCount(text: string): number {
  return parseWizardWords(text).length;
}

export function getWizardInputError(text: string): WizardInputError | null {
  if (new TextEncoder().encode(text).byteLength > MAX_WIZARD_INPUT_BYTES) {
    return { code: 'input-too-large', maxBytes: MAX_WIZARD_INPUT_BYTES };
  }
  return getWizardInputWordCount(text) > MAX_WIZARD_INPUT_WORDS
    ? { code: 'too-many-words', maxWords: MAX_WIZARD_INPUT_WORDS }
    : null;
}

export function getWizardInputFileError(fileSize: number): WizardInputError | null {
  return fileSize > MAX_WIZARD_INPUT_FILE_BYTES
    ? { code: 'file-too-large', maxBytes: MAX_WIZARD_INPUT_FILE_BYTES }
    : null;
}

export function deduplicateWizardWords(words: string[]): string[] {
  return removeDuplicates(words);
}
