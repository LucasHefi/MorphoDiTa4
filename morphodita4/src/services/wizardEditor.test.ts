import { expect, it } from 'vitest';
import { getWizardEditorPage, replaceWizardEditorPage, WIZARD_EDITOR_PAGE_CHARS } from './wizardEditor';
it('bounds a ten-MB editor and replaces only the selected part', () => {
  const text = 'a'.repeat(10_000_000);
  const page = getWizardEditorPage(text, 199);
  expect(page.pages).toBe(200);
  expect(page.value).toHaveLength(WIZARD_EDITOR_PAGE_CHARS);
  expect(page.start).toBe(9_950_000);
  const edited = replaceWizardEditorPage(text, 199, 'end');
  expect(edited).toBe('a'.repeat(9_950_000) + 'end');
});
it('never splits a surrogate pair and recombines every source character', () => {
  const text = 'a'.repeat(49_999) + '😀' + 'b'.repeat(50_000);
  const pages = Array.from({ length: getWizardEditorPage(text, 0).pages }, (_, i) => getWizardEditorPage(text, i));
  expect(pages.map(p => p.value).join('')).toBe(text);
  expect(pages[0].value.endsWith('\uD83D')).toBe(false);
  expect(pages[1].value.startsWith('😀')).toBe(true);
});
