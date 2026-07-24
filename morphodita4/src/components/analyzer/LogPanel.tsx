import React, { useState } from 'react';
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
  const [filter, setFilter] = useState<LogFilter>('ALL');
  const filters: LogFilter[] = ['ALL', 'INFO', 'WARNING', 'ERROR'];

  const filteredLogs = logs.filter((log) => {
    if (filter === 'ALL') return true;
    if (filter === 'INFO') return ['INFO', 'DEBUG'].includes(log.level);
    return log.level === filter;
  });

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return 'text-destructive';
      case 'WARNING': return 'text-yellow-600 dark:text-yellow-500';
      case 'INFO': return 'text-blue-600 dark:text-blue-400';
      case 'DEBUG': return 'text-muted-foreground';
      default: return 'text-foreground';
    }
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="flex justify-between items-center p-2 bg-secondary/50 border-b border-border">
        <div className="flex gap-2">
          {filters.map((level) => (
            <button
              key={level}
              onClick={() => setFilter(level)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                filter === level
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={onClear} className="h-7 text-xs text-muted-foreground">
          <Trash2 className="w-3 h-3 mr-1" />
          Clear
        </Button>
      </div>
      <div className="flex-1 p-2 overflow-y-auto font-mono text-xs max-h-[300px]">
        {filteredLogs.length === 0 ? (
          <div className="text-muted-foreground text-center py-4">No logs to display</div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="mb-1 flex gap-2">
              <span className="text-muted-foreground whitespace-nowrap">
                [{new Date(log.timestamp).toLocaleTimeString()}]
              </span>
              <span className={`font-semibold ${getLevelColor(log.level)}`}>
                {log.level}
              </span>
              <span className="text-foreground break-all whitespace-pre-wrap">
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
