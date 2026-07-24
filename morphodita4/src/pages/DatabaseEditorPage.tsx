import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DatabaseService } from '../services/database';
import { DATABASE_PAGE_SIZE, hasExpectedAffectedRows } from '../components/database/databaseEditorContracts';
import type { DatabaseId, DatabaseRow } from '../types/database';
import { DatabaseTable } from '../components/database/DatabaseTable';
import { Button, Input } from '../components/common';
import { cn } from '../components/common/utils';
import { RefreshCw, Search, Trash2, X } from 'lucide-react';

type TableType = 'sessions' | 'morphological_data';

export const DatabaseEditorPage: React.FC = () => {
  const { t } = useTranslation();
  const [tableType, setTableType] = useState<TableType>('sessions');
  const [data, setData] = useState<DatabaseRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<DatabaseId>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setStatus(t('common.loading'));
    try {
      const result = await DatabaseService.getAllData(
        tableType,
        DATABASE_PAGE_SIZE,
        page * DATABASE_PAGE_SIZE,
      );
      setData(result);
      setStatus(`${result.length} záznamů načteno`);
    } catch (error) {
      setStatus(`${t('common.error')}: ${String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }, [tableType, t, page]);

  useEffect(() => {
    loadData();
    setSelectedIds(new Set());
  }, [tableType, loadData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'F5') {
        e.preventDefault();
        loadData();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loadData]);

  const handleSearch = useCallback(async () => {
    if (!searchTerm.trim()) {
      await loadData();
      return;
    }

    setIsLoading(true);
    setStatus(t('common.loading'));
    try {
      const searchable = tableType === 'sessions' 
        ? ['operation', 'model', 'input_text', 'status']
        : ['source_type', 'original_form', 'lemma', 'tag', 'generated_form'];
      const result = await DatabaseService.searchRecords(tableType, searchTerm, searchable);
      setData(result);
      setStatus(`${result.length} záznamů nalezeno`);
    } catch (error) {
      setStatus(`${t('common.error')}: ${String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, tableType, loadData, t]);

  const handleClearSearch = useCallback(async () => {
    setSearchTerm('');
    await loadData();
  }, [loadData]);

  const handleDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;

    if (!confirm(`${t('database.delete')} ${selectedIds.size} záznamů?`)) return;

    setIsLoading(true);
    setStatus(t('common.loading'));
    try {
      const ids = Array.from(selectedIds);
      const affectedRows = await DatabaseService.deleteRecords(tableType, ids);
      if (!hasExpectedAffectedRows(affectedRows, ids.length)) {
        throw new Error(`Změněno bylo ${affectedRows} z ${ids.length} záznamů`);
      }
      await loadData();
      setSelectedIds(new Set());
      setStatus(`${t('common.success')}: ${t('database.delete')} ${ids.length} záznamů`);
    } catch (error) {
      setStatus(`${t('common.error')}: ${String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedIds, tableType, t, loadData]);

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 container max-w-7xl py-8 px-4 sm:px-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h1 className="text-3xl font-bold mb-6 text-foreground">{t('database.title')}</h1>

        <div className="space-y-4">
          <div className="glass-panel rounded-lg p-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <select
                  value={tableType}
                  onChange={(e) => {
                    setTableType(e.target.value as TableType);
                    setPage(0);
                  }}
                  className="px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                >
                  <option value="sessions">{t('database.table.sessions')}</option>
                  <option value="morphological_data">{t('database.table.morphological_data')}</option>
                </select>

                <div className="flex gap-2 items-center">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      ref={searchInputRef}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={t('database.searchPlaceholder')}
                      className="pl-8 w-64"
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSearch}
                    disabled={isLoading}
                  >
                    {t('database.search')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearSearch}
                    disabled={isLoading || !searchTerm}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={loadData}
                  disabled={isLoading}
                >
                  <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                  <span className="ml-1">{t('database.refresh')}</span>
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDelete}
                  disabled={selectedIds.size === 0 || isLoading}
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="ml-1">{t('database.delete')}</span>
                </Button>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-lg p-4">
            <DatabaseTable
              tableType={tableType}
              data={data}
              selectedIds={selectedIds}
              onSelectChange={setSelectedIds}
              onStatusChange={setStatus}
              onRefresh={loadData}
            />
          </div>

          {!searchTerm.trim() && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0 || isLoading}
              >
                {t('database.previous')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('database.page')} {page + 1}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((current) => current + 1)}
                disabled={isLoading || data.length < DATABASE_PAGE_SIZE}
              >
                {t('database.next')}
              </Button>
            </div>
          )}

          <div className="text-sm text-muted-foreground px-2">
            {status}
          </div>
        </div>
      </main>
    </div>
  );
};