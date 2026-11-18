// Bound native textarea layout independently of the full, validated source.
export const WIZARD_EDITOR_PAGE_CHARS = 50_000;
export function getWizardEditorPage(text: string, requestedPage: number) {
  const pages = Math.max(1, Math.ceil(text.length / WIZARD_EDITOR_PAGE_CHARS));
  const page = Math.max(0, Math.min(requestedPage, pages - 1));
  const boundary = (offset: number) => {
    const position = Math.min(offset, text.length);
    const previous = text.charCodeAt(position - 1), next = text.charCodeAt(position);
    return previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF ? position - 1 : position;
  };
  const start = boundary(page * WIZARD_EDITOR_PAGE_CHARS);
  const end = boundary((page + 1) * WIZARD_EDITOR_PAGE_CHARS);
  return { page, pages, start, end, value: text.slice(start, end) };
}
export function replaceWizardEditorPage(text: string, page: number, value: string): string {
  const { start, end } = getWizardEditorPage(text, page);
  return text.slice(0, start) + value + text.slice(end);
}
