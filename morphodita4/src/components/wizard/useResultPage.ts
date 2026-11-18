import { useState } from 'react';

export const RESULT_PAGE_SIZE = 200;
export function useResultPage<T>(data: readonly T[]) {
  const [selection, setSelection] = useState({ data, page: 0 });
  const pages = Math.max(1, Math.ceil(data.length / RESULT_PAGE_SIZE));
  const page = selection.data === data ? Math.min(selection.page, pages - 1) : 0;
  const start = page * RESULT_PAGE_SIZE;
  return { items: data.slice(start, start + RESULT_PAGE_SIZE), start, page, pages,
    setPage: (next: number) => setSelection({ data, page: Math.max(0, Math.min(next, pages - 1)) }) };
}
