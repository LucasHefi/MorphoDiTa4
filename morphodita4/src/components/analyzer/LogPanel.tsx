import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../common/Button';
import { Trash2 } from 'lucide-react';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
  message: string;
}

type LogFilter = 'ALL' | 'INFO' | 'WARNING' | 'ERROR';

export interface LogPanelProps {
  logs: LogEntry[];
  onClear: () => void;
}

export const LogPanel: React.FC<LogPanelProps> = ({ logs, onClear }) => {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<LogFilter>('ALL');
  const filters: LogFilter[] = ['ALL', 'INFO', 'WARNING', 'ERROR'];
  const filterLabels: Record<LogFilter, string> = { ALL: t('analyzer.logs.all'), INFO: t('analyzer.logs.info'), WARNING: t('analyzer.logs.warning'), ERROR: t('analyzer.logs.error') };
  const locale = ({ cs: 'cs-CZ', en: 'en-US', pl: 'pl-PL' } as const)[(i18n?.language ?? 'cs').split('-')[0] as 'cs' | 'en' | 'pl'] ?? 'cs-CZ';

  const filteredLogs = logs.filter((log) => {
    if (filter === 'ALL') return true;
    if (filter === 'INFO') return ['INFO', 'DEBUG'].includes(log.level);
    return log.level === filter;
  });

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return 'status-error';
      case 'WARNING': return 'status-warning';
      case 'INFO': return 'status-info';
      case 'DEBUG': return 'text-muted-foreground';
      default: return 'text-foreground';
    }
  };

  return (
    <details open className="flex flex-col h-full bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <summary className="cursor-pointer list-none p-2 bg-secondary/50 border-b border-border">
         <span>{t('analyzer.logs.title')}</span>
      </summary>
      <div className="flex justify-between items-center gap-2 p-2 bg-secondary/50 border-b border-border">
        <div className="flex gap-2">
          {filters.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={filter === level}
              onClick={(event) => { event.preventDefault(); setFilter(level); }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                filter === level
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
               {filterLabels[level]}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={(event) => { event.preventDefault(); onClear(); }} className="h-7 text-xs text-muted-foreground">
           <Trash2 aria-hidden="true" className="w-3 h-3 mr-1" />
           {t('analyzer.logs.clear')}
        </Button>
      </div>
      <div role="log" aria-live="polite" className="min-h-0 flex-1 p-2 overflow-y-auto font-mono text-xs max-h-[min(50vh,28rem)]">
        {filteredLogs.length === 0 ? (
           <div role="status" className="text-muted-foreground text-center py-4">{t('analyzer.logs.empty')}</div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="mb-1 flex gap-2">
              <span className="text-muted-foreground whitespace-nowrap">
                 [{new Date(log.timestamp).toLocaleTimeString(locale)}]
              </span>
              <span data-status={log.level.toLowerCase()} className={`font-semibold ${getLevelColor(log.level)}`}>
                {log.level}
              </span>
              <span className="text-foreground break-all whitespace-pre-wrap">
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </details>
  );
};
