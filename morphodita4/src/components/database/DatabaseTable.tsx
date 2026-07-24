import React, { useState, useMemo, useCallback } from 'react';
import { DatabaseService } from '../../services/database';
import { canEditDatabaseColumn, hasExpectedAffectedRows } from './databaseEditorContracts';
import type { DatabaseId, DatabaseRow } from '../../types/database';
import { cn } from '../common/utils';

type TableType = 'sessions' | 'morphological_data';

interface ColumnConfig {
  key: string;
  label: string;
  width?: number;
  sortable?: boolean;
  editable?: boolean;
}

const TABLE_CONFIG: Record<TableType, { columns: ColumnConfig[]; searchable: string[] }> = {
  sessions: {
    columns: [
      { key: 'id', label: 'ID', width: 80 },
      { key: 'operation', label: 'Operace', width: 100, editable: true },
      { key: 'model', label: 'Model', width: 120, editable: true },
      { key: 'input_text', label: 'Vstup', width: 200, editable: true },
      { key: 'parameters', label: 'Parametry', width: 150, editable: true },
      { key: 'result_count', label: 'Výsledků', width: 80, editable: true },
      { key: 'processing_time', label: 'Čas (s)', width: 80, editable: true },
      { key: 'status', label: 'Status', width: 100, editable: true },
      { key: 'error_message', label: 'Chyba', width: 150, editable: true },
      { key: 'created_at', label: 'Vytvořeno', width: 120 },
      { key: 'completed_at', label: 'Dokončeno', width: 120 },
    ],
    searchable: ['operation', 'model', 'input_text', 'status'],
  },
  morphological_data: {
    columns: [
      { key: 'id', label: 'ID', width: 80 },
      { key: 'source_type', label: 'Typ', width: 80, editable: true },
      { key: 'original_form', label: 'Původní forma', width: 150, editable: true },
      { key: 'lemma', label: 'Lemma', width: 150, editable: true },
      { key: 'tag', label: 'Tag', width: 120, editable: true },
      { key: 'generated_form', label: 'Vygenerovaná forma', width: 150, editable: true },
      { key: 'probability', label: 'Pravděpodobnost', width: 120, editable: true },
      { key: 'session_id', label: 'Relace ID', width: 100, editable: true },
      { key: 'created_at', label: 'Vytvořeno', width: 120 },
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
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [editingCell, setEditingCell] = useState<{ id: DatabaseId; field: string } | null>(null);
  const [editValue, setEditValue] = useState<unknown>(null);

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
    setEditingCell({ id, field });
    setEditValue(value);
  }, []);

  const handleEditComplete = useCallback(async () => {
    if (!editingCell) return;

    try {
      const affectedRows = await DatabaseService.updateRecord(
        tableType,
        editingCell.id,
        editingCell.field,
        editValue,
      );
      if (!hasExpectedAffectedRows(affectedRows)) {
        throw new Error('Záznam nebyl změněn');
      }
      await onRefresh();
      onStatusChange('Uloženo');
    } catch (error) {
      onStatusChange(`Chyba: ${String(error)}`);
    }

    setEditingCell(null);
    setEditValue(null);
  }, [editingCell, editValue, tableType, onRefresh, onStatusChange]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === 'Escape') {
      void handleEditComplete();
    }
  }, [handleEditComplete]);

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
      return new Date(dateValue).toLocaleString('cs-CZ', {
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
      <div className="overflow-x-auto max-h-[600px]">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-background/90 backdrop-blur z-10">
            <tr className="border-b border-border">
              <th className="px-2 py-2 w-10">
                <input
                  type="checkbox"
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
                  className={cn(
                    'px-3 py-2 text-left text-sm font-medium text-foreground/70',
                    column.sortable !== false && 'cursor-pointer hover:text-foreground',
                  )}
                  style={{ width: column.width }}
                  onClick={() => column.sortable !== false && handleSort(column.key)}
                >
                  <div className="flex items-center gap-1">
                    {column.label}
                    {sortColumn === column.key && (
                      <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
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
                      checked={selectedIds.has(rowId)}
                      onChange={(event) => handleSelectRow(rowId, event.target.checked)}
                      className="w-4 h-4 accent-primary"
                    />
                  </td>
                  {config.columns.map((column) => {
                    const value = getFieldValue(row, column.key);
                    return (
                      <td
                        key={column.key}
                        className="px-3 py-1 text-sm text-foreground/90 cursor-pointer"
                        onDoubleClick={() => canEditDatabaseColumn(column.editable) && handleEditStart(rowId, column.key, value)}
                      >
                        {editingCell?.id === rowId && editingCell?.field === column.key ? (
                          <input
                            type={column.key === 'processing_time' || column.key === 'probability' || column.key === 'result_count' ? 'number' : 'text'}
                            value={typeof editValue === 'string' || typeof editValue === 'number' ? editValue : ''}
                            onChange={(event) => setEditValue(
                              column.key === 'processing_time' || column.key === 'probability' || column.key === 'result_count'
                                ? parseFloat(event.target.value)
                                : event.target.value,
                            )}
                            onBlur={() => void handleEditComplete()}
                            onKeyDown={handleKeyDown}
                            className="w-full px-1 py-0.5 text-xs bg-background border border-border rounded"
                            autoFocus
                          />
                        ) : (
                          <span>
                            {column.key === 'created_at' || column.key === 'completed_at'
                              ? formatDate(value)
                              : formatCellValue(value, column.key)}
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
                  Žádná data k zobrazení
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
