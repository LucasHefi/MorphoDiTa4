import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [copyFeedback, setCopyFeedback] = useState<'success' | 'error' | null>(null);
  const [isCopying, setIsCopying] = useState(false);

  const handleCopy = async () => {
    if (isCopying) return;
    setCopyFeedback(null);
    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopyFeedback('success');
    } catch {
      setCopyFeedback('error');
    } finally {
      setIsCopying(false);
    }
  };

  const renderMorphologicalTable = (data: DisplayMorphologicalTag[][], showGeneratedForm = false) => (
    <div className="overflow-x-auto overflow-y-auto rounded-md border border-border">
       <table aria-label={t('analyzer.results.morphologicalTable')} className="min-w-[36rem] w-full text-sm text-left text-muted-foreground">
         <caption className="sr-only">{t('analyzer.results.morphologicalTable')}</caption>
        <thead className="text-xs text-foreground uppercase bg-secondary">
          <tr>
             <th scope="col" className="px-4 py-3">{t('analyzer.results.word')}</th>
             <th scope="col" className="px-4 py-3">{t('analyzer.results.lemma')}</th>
             <th scope="col" className="px-4 py-3">{t('analyzer.results.tag')}</th>
             {showGeneratedForm && <th scope="col" className="px-4 py-3">{t('analyzer.results.form')}</th>}
             {showGeneratedForm && <th scope="col" className="px-4 py-3">{t('analyzer.results.probability')}</th>}
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
    <div className="overflow-x-auto overflow-y-auto rounded-md border border-border">
       <table aria-label={t('analyzer.results.tokenTable')} className="min-w-[24rem] w-full text-sm text-left text-muted-foreground">
         <caption className="sr-only">{t('analyzer.results.tokenTable')}</caption>
        <thead className="text-xs text-foreground uppercase bg-secondary">
          <tr>
             <th scope="col" className="px-4 py-3">{t('analyzer.results.token')}</th>
             <th scope="col" className="px-4 py-3">{t('analyzer.results.space')}</th>
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
       label: t('analyzer.results.table'),
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
       label: t('analyzer.results.json'),
      content: (
        <div className="mt-4 relative group">
           <pre className="max-h-[min(60vh,32rem)] overflow-auto whitespace-pre-wrap break-words p-4 bg-background border border-border rounded-md text-sm">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      ),
    },
  ];

  return (
    <div className="result-panel min-w-0 w-full flex flex-col h-full">
      <div className="flex justify-end items-center mb-4">

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleCopy()}
            disabled={isCopying}
            aria-busy={isCopying}
            className="h-8"
          >
            <Copy aria-hidden="true" className="w-4 h-4 mr-2" />
             {t('design.copyJson')}
          </Button>
        </div>
      </div>
      {copyFeedback && (
        <div role={copyFeedback === 'success' ? 'status' : 'alert'} aria-live="polite" className={copyFeedback === 'success' ? 'status-success rounded-md border p-2 text-sm' : 'status-error rounded-md border p-2 text-sm'}>
           {copyFeedback === 'success' ? t('analyzer.results.copied') : t('analyzer.results.copyError')}
        </div>
      )}

       <div className="min-w-0 flex-1 overflow-auto">
         <Tabs tabs={tabs} ariaLabel={t('analyzer.results.tabsLabel')} defaultTabId="table" />
      </div>
    </div>
  );
};
