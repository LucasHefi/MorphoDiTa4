import { parseInputText, removeDuplicates } from './filters';

export const MAX_WIZARD_INPUT_WORDS = 10_000;
export const MAX_WIZARD_INPUT_BYTES = 5 * 1024 * 1024;
export const MAX_WIZARD_INPUT_FILE_BYTES = MAX_WIZARD_INPUT_BYTES;

export type WizardInputError =
  | { code: 'too-many-words'; maxWords: number }
  | { code: 'input-too-large'; maxBytes: number }
  | { code: 'file-too-large'; maxBytes: number }
  | { code: 'file-read-failed' };

export function getWizardInputWordCount(text: string): number {
  return parseInputText(text).length;
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
