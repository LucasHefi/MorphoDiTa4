// A clipped span still lays out its entire text. Keep large session inputs out
// of both text nodes and tooltip attributes; editing continues to use the raw value.
export const DATABASE_CELL_PREVIEW_LENGTH = 320;

export function previewDatabaseCell(value: string): string {
  if (value.length <= DATABASE_CELL_PREVIEW_LENGTH) return value;
  let end = DATABASE_CELL_PREVIEW_LENGTH - 1;
  // Keep a surrogate pair together at the preview boundary.
  const last = value.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${value.slice(0, end)}…`;
}
