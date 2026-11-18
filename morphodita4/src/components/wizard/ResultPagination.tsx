import { useResultPage } from './useResultPage';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../common';

export function ResultPager({ page, pages, setPage }: { page: number; pages: number; setPage: (page: number) => void }) {
  const { t } = useTranslation();
  if (pages <= 1) return null;
  return <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
    <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('database.previous')}</Button>
    <label className="flex items-center gap-1 text-xs text-muted-foreground">{t('database.page')} <input className="w-20 rounded border border-input bg-background p-1" aria-label={t('database.page')} type="number" min={1} max={pages} value={page + 1} onChange={(event) => setPage((Number.parseInt(event.target.value, 10) || 1) - 1)} /> / {pages}</label>
    <Button size="sm" variant="ghost" disabled={page === pages - 1} onClick={() => setPage(page + 1)}>{t('database.next')}</Button>
  </div>;
}
export function PagedValues({ values, label }: { values: readonly string[]; label: string }) {
  const paging = useResultPage(values);
  return <><div className="h-64 overflow-y-auto overflow-x-hidden break-all text-xs whitespace-pre-wrap" aria-label={label}>
    {paging.items.map((value, index): ReactNode => <div className="summary-value" key={`${paging.start + index}:${value}`}>{value}</div>)}
  </div><ResultPager {...paging} /></>;
}
