import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DatabaseService } from '../../services/database';
import { canEditDatabaseColumn, hasExpectedAffectedRows } from './databaseEditorContracts';
import type { DatabaseId, DatabaseRow } from '../../types/database';
import { Badge } from '../common/Badge';
import { cn } from '../common/utils';
import { previewDatabaseCell } from './databaseCellPreview';

type TableType = 'sessions' | 'morphological_data';

interface ColumnConfig {
  key: string;
  labelKey: string;
  width?: number;
  sortable?: boolean;
  editable?: boolean;
}

const TABLE_CONFIG: Record<TableType, { columns: ColumnConfig[]; searchable: string[] }> = {
  sessions: {
    columns: [
       { key: 'id', labelKey: 'id', width: 80 }, { key: 'operation', labelKey: 'operation', width: 100, editable: true }, { key: 'model', labelKey: 'model', width: 120, editable: true }, { key: 'input_text', labelKey: 'input', width: 200, editable: true }, { key: 'parameters', labelKey: 'parameters', width: 150, editable: true }, { key: 'result_count', labelKey: 'results', width: 80, editable: true }, { key: 'processing_time', labelKey: 'time', width: 80, editable: true }, { key: 'status', labelKey: 'status', width: 100, editable: true }, { key: 'error_message', labelKey: 'error', width: 150, editable: true }, { key: 'created_at', labelKey: 'created', width: 120 }, { key: 'completed_at', labelKey: 'completed', width: 120 },
    ],
    searchable: ['operation', 'model', 'input_text', 'status'],
  },
  morphological_data: {
    columns: [
       { key: 'id', labelKey: 'id', width: 80 }, { key: 'source_type', labelKey: 'type', width: 80, editable: true }, { key: 'original_form', labelKey: 'originalForm', width: 150, editable: true }, { key: 'lemma', labelKey: 'lemma', width: 150, editable: true }, { key: 'tag', labelKey: 'tag', width: 120, editable: true }, { key: 'generated_form', labelKey: 'generatedForm', width: 150, editable: true }, { key: 'probability', labelKey: 'probability', width: 120, editable: true }, { key: 'session_id', labelKey: 'relationId', width: 100, editable: true }, { key: 'created_at', labelKey: 'created', width: 120 },
    ],
    searchable: ['source_type', 'original_form', 'lemma', 'tag', 'generated_form'],
  },
};

interface DatabaseTableProps {
  tableType: TableType;
  data: DatabaseRow[];
  selectedIds: Set<DatabaseId>;
  onSelectChange: (ids: Set<DatabaseId>) => void;
  onStatusChange: (status: string) => void;
  onRefresh: () => Promise<void>;
}

const getFieldValue = (row: DatabaseRow, field: string): unknown =>
  (row as unknown as Record<string, unknown>)[field];

export const DatabaseTable: React.FC<DatabaseTableProps> = ({
  tableType,
  data,
  selectedIds,
  onSelectChange,
  onStatusChange,
  onRefresh,
}) => {
  const { t, i18n } = useTranslation();
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [editingCell, setEditingCell] = useState<{ id: DatabaseId; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const cellRefs = useRef<Record<string, HTMLTableCellElement | null>>({});
  const restoreFocusKey = useRef<string | null>(null);
  const previousEditingCell = useRef<typeof editingCell>(null);
  const isSaving = useRef(false);

  const config = TABLE_CONFIG[tableType];

  const sortedData = useMemo(() => {
    if (!sortColumn) return data;
    return [...data].sort((a, b) => {
      const aVal = getFieldValue(a, sortColumn);
      const bVal = getFieldValue(b, sortColumn);
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const comparison = String(aVal).localeCompare(String(bVal));
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortColumn, sortDirection]);

  const handleSort = useCallback((column: string) => {
    if (sortColumn === column) {
      setSortDirection((previous) => previous === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn]);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      const allIds = new Set(
        data
          .map((row) => row.id)
          .filter((id): id is DatabaseId => id !== undefined),
      );
      onSelectChange(allIds);
    } else {
      onSelectChange(new Set());
    }
  }, [data, onSelectChange]);

  const handleSelectRow = useCallback((id: DatabaseId, checked: boolean) => {
    const newIds = new Set(selectedIds);
    if (checked) {
      newIds.add(id);
    } else {
      newIds.delete(id);
    }
    onSelectChange(newIds);
  }, [selectedIds, onSelectChange]);

  const handleEditStart = useCallback((id: DatabaseId, field: string, value: unknown) => {
    restoreFocusKey.current = `${id}:${field}`;
    setEditingCell({ id, field });
    setEditValue(value === null || value === undefined ? '' : String(value));
    setEditError(null);
  }, []);

  useEffect(() => {
    if (!editingCell && previousEditingCell.current && restoreFocusKey.current) {
      cellRefs.current[restoreFocusKey.current]?.focus();
      restoreFocusKey.current = null;
    }
    previousEditingCell.current = editingCell;
  }, [editingCell]);

  const handleEditComplete = useCallback(async () => {
    if (!editingCell || isSaving.current) return;

    const numericFields: Partial<Record<string, (value: number) => boolean>> = {
      result_count: (value) => Number.isInteger(value) && value >= 0,
      processing_time: (value) => value >= 0,
      probability: (value) => value >= 0 && value <= 1,
    };
    const numericValidation = numericFields[editingCell.field];
    let value: string | number = editValue;
    if (numericValidation) {
      const numericValue = Number(editValue);
      if (editValue.trim() === '' || !Number.isFinite(numericValue) || !numericValidation(numericValue)) {
         setEditError(t('database.editInvalid'));
         onStatusChange(t('database.errorStatus', { message: t('database.editInvalid') }));
        return;
      }
      value = numericValue;
    }

    isSaving.current = true;
    try {
      const affectedRows = await DatabaseService.updateRecord(
        tableType,
        editingCell.id,
        editingCell.field,
        value,
      );
       if (!hasExpectedAffectedRows(affectedRows)) {
          throw new Error(t('database.notChanged'));
       }
       onStatusChange(t('database.saved'));
       setEditingCell(null);
       setEditValue('');
       setEditError(null);
       try {
         await onRefresh();
       } catch (error) {
         onStatusChange(t('database.errorStatus', {
           message: t('database.saveRefreshFailed', { message: String(error) }),
         }));
       }
    } catch (error) {
       setEditError(t('database.saveFailed', { message: String(error) }));
       onStatusChange(t('database.errorStatus', { message: String(error) }));
    } finally {
      isSaving.current = false;
    }
  }, [editingCell, editValue, tableType, onRefresh, onStatusChange, t]);

  const handleEditCancel = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
    setEditError(null);
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleEditCancel();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void handleEditComplete();
    }
  }, [handleEditCancel, handleEditComplete]);

  const formatCellValue = (value: unknown, field: string): string => {
    if (value === null || value === undefined) return '-';
    if (field === 'parameters' && typeof value === 'object') return JSON.stringify(value);
    if (field === 'processing_time' && typeof value === 'number') return value.toFixed(2);
    if (field === 'probability' && typeof value === 'number') return value.toFixed(4);
    return String(value);
  };

  const formatDate = (dateValue: unknown): string => {
    if (typeof dateValue !== 'string' || !dateValue) return '-';
    try {
       const language = i18n.language.split('-')[0];
       const locale = language === 'en' ? 'en-US' : language === 'pl' ? 'pl-PL' : 'cs-CZ';
       return new Date(dateValue).toLocaleString(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateValue;
    }
  };

  const allSelected = data.length > 0 && data.every((row) => row.id !== undefined && selectedIds.has(row.id));
  const someSelected = data.some((row) => row.id !== undefined && selectedIds.has(row.id)) && !allSelected;

  return (
    <div className="glass-panel rounded-lg overflow-hidden">
      <div className="overflow-auto max-h-[min(70vh,48rem)]">
        <table aria-label={t(`database.caption.${tableType}`)} className="w-full border-collapse">
          <caption className="sr-only">{t(`database.caption.${tableType}`)}</caption>
          <thead className="sticky top-0 bg-background z-10">
            <tr className="border-b border-border">
               <th scope="col" className="px-2 py-2 w-10">
                <input
                  type="checkbox"
                   aria-label={t('common.selectAll')}
                  checked={allSelected}
                  ref={(element) => {
                    if (element) element.indeterminate = someSelected;
                  }}
                  onChange={(event) => handleSelectAll(event.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
              </th>
               {config.columns.map((column) => (
                <th
                  key={column.key}
                   scope="col"
                   className={cn(
                    'px-3 py-2 text-left text-sm font-medium text-foreground/70',
                    column.sortable !== false && 'hover:text-foreground',
                  )}
                  style={{ width: column.width }}
                   aria-sort={sortColumn === column.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                 >
                   {column.sortable !== false ? (
                   <button type="button" className="flex items-center gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={() => handleSort(column.key)}>
                        {t(`database.columns.${column.labelKey}`)}
                       {sortColumn === column.key && <span aria-hidden="true" className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                     </button>
                    ) : t(`database.columns.${column.labelKey}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row) => {
              const rowId = row.id ?? '';
              return (
                <tr
                  key={rowId}
                  className={cn(
                    'border-b border-border/50 hover:bg-secondary/30 transition-colors',
                    selectedIds.has(rowId) && 'bg-primary/20',
                  )}
                >
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                       aria-label={t('common.selectRecord', { id: rowId })}
                      checked={selectedIds.has(rowId)}
                      onChange={(event) => handleSelectRow(rowId, event.target.checked)}
                      className="w-4 h-4 accent-primary"
                    />
                  </td>
                  {config.columns.map((column) => {
                    const value = getFieldValue(row, column.key);
                    // Bound actual DOM text, not just its visible CSS width.
                    const preview = previewDatabaseCell(formatCellValue(value, column.key));
                    return (
                      <td
                        key={column.key}
                        ref={(element) => { cellRefs.current[`${rowId}:${column.key}`] = element; }}
                        tabIndex={canEditDatabaseColumn(column.editable) ? 0 : undefined}
                         aria-label={canEditDatabaseColumn(column.editable) ? t('common.editRecord', { field: t(`database.columns.${column.labelKey}`), id: rowId }) : undefined}
                        className={cn('px-3 py-1 text-sm text-foreground/90', canEditDatabaseColumn(column.editable) && 'cursor-pointer')}
                        onDoubleClick={() => canEditDatabaseColumn(column.editable) && handleEditStart(rowId, column.key, value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && canEditDatabaseColumn(column.editable)) {
                            event.preventDefault();
                            handleEditStart(rowId, column.key, value);
                          }
                        }}
                      >
                        {editingCell?.id === rowId && editingCell?.field === column.key ? (
                          <>
                            <input
                              type="text"
                              value={editValue}
                              onChange={(event) => { setEditValue(event.target.value); setEditError(null); }}
                              onBlur={() => void handleEditComplete()}
                              onKeyDown={(event) => { event.stopPropagation(); handleKeyDown(event); }}
                               aria-label={t('common.editRecord', { field: t(`database.columns.${column.labelKey}`), id: rowId })}
                              aria-invalid={editError !== null}
                              aria-describedby={editError ? `${rowId}-${column.key}-edit-error` : undefined}
                              className="w-full px-1 py-0.5 text-xs bg-background border border-border rounded"
                              autoFocus
                            />
                            {editError && (
                              <p id={`${rowId}-${column.key}-edit-error`} role="alert" className="text-xs text-destructive">
                                {editError}
                              </p>
                            )}
                          </>
                        ) : (
                          <span title={preview}>
                            {column.key === 'status' && typeof value === 'string' && ['completed', 'failed', 'pending', 'processing'].includes(value)
                              ? <Badge variant={value === 'completed' ? 'success' : value === 'failed' ? 'error' : 'info'}>{t(`home.status.${value}`)}</Badge>
                              : column.key === 'created_at' || column.key === 'completed_at' ? formatDate(value) : preview}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {sortedData.length === 0 && (
              <tr>
                <td colSpan={config.columns.length + 1} className="px-4 py-8 text-center text-muted-foreground">
                   {t('common.noData')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
