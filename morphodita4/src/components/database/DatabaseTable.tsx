import React, { useState, useMemo, useCallback } from 'react';
import { DatabaseService } from '../../services/database';
import { Session, MorphologicalData } from '../../types/database';
import { cn } from '../common/Button';

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
      { key: 'operation', label: 'Operace', width: 100 },
      { key: 'model', label: 'Model', width: 120 },
      { key: 'input_text', label: 'Vstup', width: 200 },
      { key: 'parameters', label: 'Parametry', width: 150 },
      { key: 'result_count', label: 'Výsledků', width: 80 },
      { key: 'processing_time', label: 'Čas (s)', width: 80 },
      { key: 'status', label: 'Status', width: 100 },
      { key: 'error_message', label: 'Chyba', width: 150 },
      { key: 'created_at', label: 'Vytvořeno', width: 120 },
      { key: 'completed_at', label: 'Dokončeno', width: 120 },
    ],
    searchable: ['operation', 'model', 'input_text', 'status'],
  },
  morphological_data: {
    columns: [
      { key: 'id', label: 'ID', width: 80 },
      { key: 'source_type', label: 'Typ', width: 80 },
      { key: 'original_form', label: 'Původní forma', width: 150 },
      { key: 'lemma', label: 'Lemma', width: 150 },
      { key: 'tag', label: 'Tag', width: 120 },
      { key: 'generated_form', label: 'Vygenerovaná forma', width: 150 },
      { key: 'probability', label: 'Pravděpodobnost', width: 120 },
      { key: 'session_id', label: 'Relace ID', width: 100 },
      { key: 'created_at', label: 'Vytvořeno', width: 120 },
    ],
    searchable: ['source_type', 'original_form', 'lemma', 'tag', 'generated_form'],
  },
};

interface DatabaseTableProps {
  tableType: TableType;
  data: (Session | MorphologicalData)[];
  selectedIds: Set<number>;
  onSelectChange: (ids: Set<number>) => void;
  onDataChange: (data: any[]) => void;
  onStatusChange: (status: string) => void;
}

export const DatabaseTable: React.FC<DatabaseTableProps> = ({
  tableType,
  data,
  selectedIds,
  onSelectChange,
  onDataChange,
  onStatusChange,
}) => {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState<any>(null);

  const config = TABLE_CONFIG[tableType];

  const sortedData = useMemo(() => {
    if (!sortColumn) return data;
    return [...data].sort((a: any, b: any) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const comparison = String(aVal).localeCompare(String(bVal));
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortColumn, sortDirection]);

  const handleSort = useCallback((column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn]);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      const allIds = new Set(data.map((row: any) => row.id).filter(Boolean));
      onSelectChange(allIds);
    } else {
      onSelectChange(new Set());
    }
  }, [data, onSelectChange]);

  const handleSelectRow = useCallback((id: number, checked: boolean) => {
    const newIds = new Set(selectedIds);
    if (checked) {
      newIds.add(id);
    } else {
      newIds.delete(id);
    }
    onSelectChange(newIds);
  }, [selectedIds, onSelectChange]);

  const handleEditStart = useCallback((id: number, field: string, value: any) => {
    setEditingCell({ id, field });
    setEditValue(value);
  }, []);

  const handleEditComplete = useCallback(async () => {
    if (!editingCell) return;

    try {
      await DatabaseService.updateRecord(tableType, editingCell.id, editingCell.field, editValue);
      const updated = data.map((row: any) => 
        row.id === editingCell.id ? { ...row, [editingCell.field]: editValue } : row
      );
      onDataChange(updated);
      onStatusChange('Uloženo');
    } catch (error) {
      onStatusChange(`Chyba: ${String(error)}`);
    }

    setEditingCell(null);
    setEditValue(null);
  }, [editingCell, editValue, data, tableType, onDataChange, onStatusChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      handleEditComplete();
    }
  }, [handleEditComplete]);

  const formatCellValue = (value: any, field: string): string => {
    if (value === null || value === undefined) return '-';
    if (field === 'parameters' && typeof value === 'object') return JSON.stringify(value);
    if (field === 'processing_time' && typeof value === 'number') return value.toFixed(2);
    if (field === 'probability' && typeof value === 'number') return value.toFixed(4);
    return String(value);
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('cs-CS', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const allSelected = data.length > 0 && data.every((row: any) => selectedIds.has(row.id));
  const someSelected = data.some((row: any) => selectedIds.has(row.id)) && !allSelected;

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
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
              </th>
              {config.columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-3 py-2 text-left text-sm font-medium text-foreground/70",
                    col.sortable !== false && "cursor-pointer hover:text-foreground"
                  )}
                  style={{ width: col.width }}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {sortColumn === col.key && (
                      <span className="text-xs">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row: any) => (
              <tr
                key={row.id}
                className={cn(
                  "border-b border-border/50 hover:bg-secondary/30 transition-colors",
                  selectedIds.has(row.id) && "bg-primary/20"
                )}
              >
                <td className="px-2 py-1">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={(e) => handleSelectRow(row.id, e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                </td>
                {config.columns.map((col) => (
                  <td
                    key={col.key}
                    className="px-3 py-1 text-sm text-foreground/90 cursor-pointer"
                    onDoubleClick={() => handleEditStart(row.id, col.key, row[col.key])}
                  >
                    {editingCell?.id === row.id && editingCell?.field === col.key ? (
                      <input
                        type={col.key === 'processing_time' || col.key === 'probability' || col.key === 'result_count' ? 'number' : 'text'}
                        value={editValue ?? ''}
                        onChange={(e) => setEditValue(col.key === 'processing_time' || col.key === 'probability' || col.key === 'result_count' ? parseFloat(e.target.value) : e.target.value)}
                        onBlur={handleEditComplete}
                        onKeyDown={handleKeyDown}
                        className="w-full px-1 py-0.5 text-xs bg-background border border-border rounded"
                        autoFocus
                      />
                    ) : (
                      <span>
                        {col.key === 'created_at' || col.key === 'completed_at' 
                          ? formatDate(row[col.key]) 
                          : formatCellValue(row[col.key], col.key)
                        }
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
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