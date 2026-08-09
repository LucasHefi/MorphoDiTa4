import React from 'react';
import { Tabs } from '../common/Tabs';
import { Button } from '../common/Button';
import { Copy } from 'lucide-react';
import type { AnalyzerResult, DisplayMorphologicalTag, Token } from '../../types/api';
import type { OperationType } from '../../types/common';
import { TagParser } from '../../services/tagParser';
import { Tooltip } from '../common/Tooltip';

export interface ResultPanelProps {
  result: AnalyzerResult;
  operation: OperationType;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({ result, operation }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
  };

  const renderMorphologicalTable = (data: DisplayMorphologicalTag[][], showGeneratedForm = false) => (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm text-left text-muted-foreground">
        <thead className="text-xs text-foreground uppercase bg-secondary">
          <tr>
            <th className="px-4 py-3">Token/Slovo</th>
            <th className="px-4 py-3">Lemma</th>
            <th className="px-4 py-3">Tag / Rozbor</th>
            {showGeneratedForm && <th className="px-4 py-3">Form</th>}
            {showGeneratedForm && <th className="px-4 py-3">Probability</th>}
          </tr>
        </thead>
        <tbody>
          {data.flat().map((item, idx) => {
            const tagBreakdown = TagParser.formatTagCompact(item.tag);
            return (
              <tr key={idx} className="bg-background border-b border-border hover:bg-secondary/50">
                <td className="px-4 py-2 font-medium text-foreground">
                  {item.token || '-'}
                </td>
                <td className="px-4 py-2">{item.lemma}</td>
                <td className="px-4 py-2">
                  <Tooltip
                    content={
                      <div className="max-w-xs space-y-1">
                        <p className="font-bold border-b border-border pb-1 mb-1">{item.tag}</p>
                        <p>{tagBreakdown}</p>
                      </div>
                    }
                  >
                    <div className="flex flex-col cursor-help">
                      <span className="font-mono text-xs text-foreground">{item.tag}</span>
                      <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                        {tagBreakdown}
                      </span>
                    </div>
                  </Tooltip>
                </td>
                {showGeneratedForm && <td className="px-4 py-2">{item.form || '-'}</td>}
                {showGeneratedForm && <td className="px-4 py-2">{item.probability ?? '-'}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderTokenTable = (data: Token[][]) => (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm text-left text-muted-foreground">
        <thead className="text-xs text-foreground uppercase bg-secondary">
          <tr>
            <th className="px-4 py-3">Token</th>
            <th className="px-4 py-3">Space</th>
          </tr>
        </thead>
        <tbody>
          {data.flat().map((item, idx) => (
            <tr key={idx} className="bg-background border-b border-border hover:bg-secondary/50">
              <td className="px-4 py-2 font-medium text-foreground">{item.token}</td>
              <td className="px-4 py-2 whitespace-pre-wrap">{item.space || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const tabs = [
    {
      id: 'table',
      label: 'Tabulka',
      content: (
        <div className="mt-4">
          {operation === 'tokenize'
            ? renderTokenTable(result as Token[][])
            : renderMorphologicalTable(result as DisplayMorphologicalTag[][], operation === 'generate')}
        </div>
      ),
    },
    {
      id: 'json',
      label: 'JSON',
      content: (
        <div className="mt-4 relative group">
          <pre className="p-4 bg-background border border-border rounded-md text-sm overflow-x-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      ),
    },
  ];

  return (
    <div className="w-full mt-6 flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-foreground">Výsledky</h3>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleCopy} className="h-8">
            <Copy className="w-4 h-4 mr-2" />
            Kopírovat
          </Button>
        </div>
      </div>

      <div className="flex-1 bg-card rounded-xl border border-border shadow-sm p-4">
        <Tabs tabs={tabs} defaultTabId="table" />
      </div>
    </div>
  );
};
