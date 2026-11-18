import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DatabaseService } from '../services/database';
import { DATABASE_PAGE_SIZE, hasExpectedAffectedRows } from '../components/database/databaseEditorContracts';
import type { DatabaseId, DatabaseRow } from '../types/database';
import { DatabaseTable } from '../components/database/DatabaseTable';
import { Button, Input } from '../components/common';
import { cn } from '../components/common/utils';
import { RefreshCw, Search, Trash2, X } from 'lucide-react';

type TableType = 'sessions' | 'morphological_data';
type Feedback = { message: string; kind: 'status' | 'alert' } | null;

export const DatabaseEditorPage: React.FC = () => {
  const { t } = useTranslation();
  const [tableType, setTableType] = useState<TableType>('sessions');
  const [data, setData] = useState<DatabaseRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<DatabaseId>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteSnapshot, setDeleteSnapshot] = useState<DatabaseId[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const refreshTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogWasOpen = useRef(false);
  const committedDeleteRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const supportsModal = typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function';
  const [useNativeModal, setUseNativeModal] = useState(supportsModal);

  const loadData = useCallback(async () => {
    const requestGeneration = ++requestGenerationRef.current;
    const isCurrentRequest = () => requestGeneration === requestGenerationRef.current;
    setIsLoading(true);
    setFeedback({ message: t('common.loading'), kind: 'status' });
    try {
      const searchable = tableType === 'sessions'
        ? ['operation', 'model', 'input_text', 'status']
        : ['source_type', 'original_form', 'lemma', 'tag', 'generated_form'];
      const result = activeSearchTerm
        ? await DatabaseService.searchRecords(tableType, activeSearchTerm, searchable, DATABASE_PAGE_SIZE, page * DATABASE_PAGE_SIZE)
        : await DatabaseService.getAllData(tableType, DATABASE_PAGE_SIZE, page * DATABASE_PAGE_SIZE);
      if (isCurrentRequest()) {
        setData(result);
        setFeedback({
          message: t(activeSearchTerm ? 'database.recordsFound' : 'database.recordsLoaded', { count: result.length }),
          kind: 'status',
        });
      }
    } catch (error) {
      if (isCurrentRequest()) {
        setFeedback({ message: t('database.errorStatus', { message: String(error) }), kind: 'alert' });
      }
      throw error;
    } finally {
      if (isCurrentRequest()) setIsLoading(false);
    }
  }, [activeSearchTerm, tableType, t, page]);

  useEffect(() => {
    void loadData().catch(() => undefined);
    setSelectedIds(new Set());
  }, [tableType, loadData]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (deleteDialogOpen) return;
      if (event.ctrlKey && event.key === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (event.key === 'F5') {
        event.preventDefault();
        void loadData().catch(() => undefined);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteDialogOpen, loadData]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (deleteDialogOpen) {
      if (useNativeModal && !dialog.open) {
        try {
          dialog.showModal();
          if (!dialog.open) {
            setUseNativeModal(false);
            return;
          }
        } catch {
          setUseNativeModal(false);
          return;
        }
      } else if (!useNativeModal) {
        dialog.setAttribute('open', '');
      }
      if (!dialog.open) dialog.setAttribute('open', '');
      cancelButtonRef.current?.focus();
      dialogWasOpen.current = true;
    } else {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      if (dialogWasOpen.current) {
        if (!committedDeleteRef.current || !isLoading) {
          (committedDeleteRef.current ? refreshTriggerRef.current : deleteTriggerRef.current)?.focus();
          committedDeleteRef.current = false;
          dialogWasOpen.current = false;
        }
      }
    }
  }, [deleteDialogOpen, isLoading, useNativeModal]);

  const handleSearch = useCallback(() => {
    setPage(0);
    setActiveSearchTerm(searchTerm.trim());
  }, [searchTerm]);

  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
    setActiveSearchTerm('');
    setPage(0);
  }, []);

  const openDeleteDialog = useCallback(() => {
    if (selectedIds.size === 0 || isLoading) return;
    committedDeleteRef.current = false;
    setDeleteSnapshot(Array.from(selectedIds));
    setDeleteError(null);
    setDeleteDialogOpen(true);
  }, [isLoading, selectedIds]);

  const closeDeleteDialog = useCallback((announce = true) => {
    if (deletePending) return;
    setDeleteDialogOpen(false);
    setDeleteSnapshot([]);
    setDeleteError(null);
    if (announce) setFeedback({ message: t('database.deleteCancelled'), kind: 'status' });
  }, [deletePending, t]);

  const handleDelete = useCallback(async () => {
    if (deleteSnapshot.length === 0 || deletePending) return;
    const ids = [...deleteSnapshot];
    setDeletePending(true);
    setDeleteError(null);
    setFeedback({ message: t('database.deleteDeleting', { count: ids.length }), kind: 'status' });
    try {
      const affectedRows = await DatabaseService.deleteRecords(tableType, ids);
      committedDeleteRef.current = true;
      setSelectedIds(new Set());
      setDeleteDialogOpen(false);
      setDeleteSnapshot([]);
      setDeleteError(null);
      setDeletePending(false);
      if (!hasExpectedAffectedRows(affectedRows, ids.length)) {
        setFeedback({
          message: t('database.deletePartial', { actual: affectedRows, expected: ids.length }),
          kind: 'alert',
        });
        return;
      }
      try {
        await loadData();
        setFeedback({ message: t('database.deleteSuccess', { count: ids.length }), kind: 'status' });
      } catch (error) {
        setFeedback({
          message: t('database.errorStatus', {
            message: t('database.deleteReloadFailed', { count: ids.length, message: String(error) }),
          }),
          kind: 'alert',
        });
      }
    } catch (error) {
      const message = t('database.deleteError', { message: String(error) });
      setDeleteError(message);
      setFeedback({ message, kind: 'alert' });
      setDeletePending(false);
    }
  }, [deletePending, deleteSnapshot, loadData, t, tableType]);

  const handleDialogKeyDown = useCallback((event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDeleteDialog();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled])'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, [closeDeleteDialog]);

  const handleTableStatus = useCallback((message: string) => {
    const errorPrefix = t('database.errorStatus', { message: '' }).trim();
    setFeedback({ message, kind: message.startsWith(errorPrefix) ? 'alert' : 'status' });
  }, [t]);

  return (
    <div className="flex flex-col">
      <main className="database-page flex-1 container max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-500">
        <h1 className="text-3xl font-bold mb-6 text-foreground">{t('database.title')}</h1>
        <p className="page-subtitle">{t('design.databaseSubtitle')}</p>
        <div className="database-workspace space-y-4">
          <div className="database-tabs" role="group" aria-label={t('database.title')}>
            {(['sessions', 'morphological_data'] as const).map((table) => <button type="button" key={table}
              data-value={table} aria-pressed={tableType === table}
              onClick={() => { setTableType(table); setActiveSearchTerm(''); setSearchTerm(''); setPage(0); }}>
              {t(`database.table.${table}`)}
            </button>)}
          </div>
          <div className="glass-panel rounded-lg p-4">
            <div className="flex flex-col xl:flex-row gap-4 items-stretch xl:items-center justify-between">
              <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center min-w-0">
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="relative">
                    <Search aria-hidden="true" className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input ref={searchInputRef} aria-label={t('database.searchLabel')} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={t('database.searchPlaceholder')} className="pl-8 w-full min-w-0 sm:w-64" onKeyDown={(event) => event.key === 'Enter' && handleSearch()} />
                  </div>
                  <Button variant="primary" size="md" onClick={handleSearch} disabled={isLoading}><Search aria-hidden="true" size={17} className="mr-2" />{t('database.search')}</Button>
                  <Button variant="ghost" size="sm" aria-label={t('common.cancel')} onClick={handleClearSearch} disabled={isLoading || !searchTerm}><X aria-hidden="true" className="w-4 h-4 mr-1" />{t('common.cancel')}</Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button ref={refreshTriggerRef} variant="secondary" size="sm" onClick={() => void loadData().catch(() => undefined)} disabled={isLoading}><RefreshCw aria-hidden="true" className={cn('w-4 h-4', isLoading && 'motion-safe:animate-spin')} /><span className="ml-1">{t('database.refresh')}</span></Button>
                <Button ref={deleteTriggerRef} variant="danger" size="sm" onClick={openDeleteDialog} disabled={selectedIds.size === 0 || isLoading}><Trash2 aria-hidden="true" className="w-4 h-4" /><span className="ml-1">{t('database.delete')}</span></Button>
              </div>
            </div>
          </div>
          <div className="glass-panel rounded-lg p-4">
            <DatabaseTable tableType={tableType} data={data} selectedIds={selectedIds} onSelectChange={setSelectedIds} onStatusChange={handleTableStatus} onRefresh={loadData} />
            <p className="database-edit-help text-sm text-muted-foreground">{t('design.editHint')} {t('design.pageHint')}</p>
          </div>
          <div className="database-footer">
            <div className="database-feedback">
              {feedback?.kind === 'alert' && <div role="alert" aria-live="assertive">{feedback.message}</div>}
              {feedback?.kind === 'status' && <div role="status" aria-live="polite">{feedback.message}</div>}
            </div>
            <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0 || isLoading}>{t('database.previous')}</Button>
            <span className="text-sm text-muted-foreground">{t('database.page')} {page + 1}</span>
            <Button variant="ghost" size="sm" onClick={() => setPage((current) => current + 1)} disabled={isLoading || data.length < DATABASE_PAGE_SIZE}>{t('database.next')}</Button>
          </div>
          </div>

        </div>
      </main>
      <dialog ref={dialogRef} open={!useNativeModal && deleteDialogOpen} aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description" onCancel={(event) => { event.preventDefault(); closeDeleteDialog(); }} onKeyDown={handleDialogKeyDown} className="rounded-lg border border-border bg-background p-6 text-foreground shadow-xl backdrop:bg-black/50">
        <div className="dialog-icon status-error"><Trash2 size={30} aria-hidden="true" /></div>
        <h2 id="delete-dialog-title" className="text-xl font-semibold">{t('database.delete')}</h2>
        <p id="delete-dialog-description" className="mt-3">{t('database.deletePrompt', { count: deleteSnapshot.length })}</p>
        {deleteError && <p role="alert" aria-live="assertive" className="mt-3 text-sm text-destructive">{deleteError}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button ref={cancelButtonRef} type="button" variant="secondary" onClick={() => closeDeleteDialog()} disabled={deletePending}>{t('common.cancel')}</Button>
          <Button type="button" variant="danger" onClick={() => void handleDelete()} disabled={deletePending}>{deletePending ? t('database.deleteDeleting', { count: deleteSnapshot.length }) : t('common.delete')}</Button>
        </div>
      </dialog>
    </div>
  );
};
