import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApiStore } from '../store/useApiStore';
import { assertModelSupportsOperation, MorphoDiTaAPI, normalizeAnalyzeResult } from '../services/api';
import { OperationType } from '../types/common';
import { splitText, processInBatches, getBatchSize } from '../services/batcher';
import {
  ModelSelector,
  OperationSelector,
  TextInput,
  AdvancedOptions,
  ResultPanel,
  LogPanel,
  ExportMenu,
} from '../components/analyzer';
import {
  exportToJson,
  downloadFile,
  exportMorphologicalTagsToCsv,
  exportMorphologicalTagsToTxt,
} from '../services/export';
import { WorkflowService } from '../services/workflow';
import { Button } from '../components/common';
import type { LogEntry } from '../components/analyzer/LogPanel';
import type { AnalyzerResult } from '../types/api';

export const AnalyzerPage: React.FC = () => {
  const { t } = useTranslation();
  const { models, selectedModel } = useApiStore();

  const [operation, setOperation] = useState<OperationType>('analyze');
  const [inputText, setInputText] = useState('');

  const [guesser, setGuesser] = useState(true);
  const [inputFormat, setInputFormat] = useState<'untokenized' | 'vertical'>('untokenized');
  const [derivation, setDerivation] = useState<'none' | 'root' | 'path' | 'tree'>('none');
  const [convertTagset, setConvertTagset] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [completed, setCompleted] = useState<{
    result: AnalyzerResult;
    operation: OperationType;
    model: string;
    input: string;
    options: { guesser: boolean; inputFormat: 'untokenized' | 'vertical'; derivation: 'none' | 'root' | 'path' | 'tree'; convertTagset: string };
  } | null>(null);
  const result = completed?.result ?? null;
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const requestController = useRef<AbortController | null>(null);

  useEffect(() => () => requestController.current?.abort(), []);

  const addLog = (level: LogEntry['level'], message: string) => {
    setLogs((prev) => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      level,
      message,
    }]);
  };

  const handleProcess = async () => {
    const operationLabel = t(`analyzer.operations.${operation}`);
    if (!selectedModel) {
      addLog('ERROR', t('analyzer.modelRequired', { operation: operationLabel }));
      return;
    }
    if (!inputText.trim()) {
      addLog('WARNING', t('analyzer.inputRequired', { operation: operationLabel }));
      return;
    }
    try {
      assertModelSupportsOperation(models, selectedModel, operation);
    } catch {
      addLog('ERROR', t('analyzer.operationUnavailable', {
        model: selectedModel,
        operation: operationLabel,
      }));
      return;
    }

    const controller = new AbortController();
    requestController.current = controller;
    setIsProcessing(true);
    setCompleted(null);
    addLog('INFO', t('analyzer.operationStarted', { operation: operationLabel }));

    try {
      const batchSize = getBatchSize();
      // Tagging needs the full sentence context and vertical sentence separators.
      const chunks = operation === 'tag' ? [inputText] : splitText(inputText, batchSize);
      if (chunks.length > 1) {
        addLog('INFO', t('analyzer.batchingNote'));
      }

      let processedResult: AnalyzerResult;
      switch (operation) {
        case 'tag': {
          const tagResponses = await processInBatches(chunks, (chunk) =>
            MorphoDiTaAPI.tagText(chunk, selectedModel, 'json', {
              signal: controller.signal, inputFormat, guesser, derivation, convertTagset,
            }),
            undefined,
            { signal: controller.signal },
          );
          processedResult = tagResponses.flatMap((response) => response.result);
          break;
        }
        case 'analyze': {
          const analyzeResponses = await processInBatches(chunks, (chunk) =>
            MorphoDiTaAPI.analyzeText(
              chunk,
              selectedModel,
              guesser,
              inputFormat,
              derivation,
              convertTagset,
              'json',
              { signal: controller.signal },
            ),
            undefined,
            { signal: controller.signal },
          );
          processedResult = normalizeAnalyzeResult(analyzeResponses.flatMap((response) => response.result));
          break;
        }
        case 'generate': {
          const generateResponses = await processInBatches(chunks, (chunk) =>
            MorphoDiTaAPI.generateForms(chunk, selectedModel, guesser, convertTagset, 'json', { signal: controller.signal }),
            undefined,
            { signal: controller.signal },
          );
          processedResult = generateResponses.flatMap((response) => response.result);
          break;
        }
        case 'tokenize': {
          const tokenizeResponses = await processInBatches(chunks, (chunk) =>
            MorphoDiTaAPI.tokenizeText(chunk, selectedModel, 'json', { signal: controller.signal }),
            undefined,
            { signal: controller.signal },
          );
          processedResult = tokenizeResponses.flatMap((response) => response.result);
          break;
        }
      }

      setCompleted({ result: processedResult, operation, model: selectedModel, input: inputText, options: { guesser, inputFormat, derivation, convertTagset } });
      addLog('INFO', t('analyzer.operationSuccess'));
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        addLog('WARNING', t('common.cancel'));
      } else {
        addLog('ERROR', t('analyzer.operationError', {
          message: error instanceof Error ? error.message : String(error),
        }));
      }
    } finally {
      requestController.current = null;
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    requestController.current?.abort();
  };

  const handleExport = async (format: 'csv' | 'json' | 'txt') => {
    if (!completed) return;
    const { result, operation } = completed;
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `morphodita-result-${operation}-${timestamp}.${format}`;
    try {
      const content = format === 'json' ? exportToJson(completed)
        : format === 'csv' ? exportMorphologicalTagsToCsv(result)
        : exportMorphologicalTagsToTxt(result);
      const destination = await downloadFile(content, filename,
        format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : 'text/plain');
      addLog('INFO', t('analyzer.exportSuccess', { format: format.toUpperCase(), filename: destination ?? filename }));
    } catch (error) {
      addLog('ERROR', `${t('common.error')}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleSave = async () => {
    if (!completed || isSaving) return;
    setIsSaving(true);
    try {
      const savedCount = await WorkflowService.saveAnalyzerResult(
        completed.operation,
        completed.result,
        completed.model,
        completed.input,
      );
      addLog('INFO', t('analyzer.saveSuccess', { count: savedCount }));
    } catch (error) {
      addLog('ERROR', `${t('common.error')}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col">
      <main className="analyzer-page flex-1 container max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-8 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
        <header className="analyzer-heading">             <h1 className="text-xl font-semibold mb-4 text-foreground">{t('home.analyzer.title')}</h1>

            <p className="text-muted-foreground mb-5">{t('design.analyzerSubtitle')}</p>
</header>
        <div className="analyzer-toolbar">            <ModelSelector disabled={isProcessing} />
            <OperationSelector selectedOperation={operation} onOperationChange={setOperation} disabled={isProcessing} />
</div>
        <div className="analyzer-left min-w-0 flex flex-col gap-4">
          <div className="analyzer-input bg-card border border-border rounded-xl p-4 sm:p-6 shadow-sm">
            <TextInput value={inputText} onChange={setInputText} disabled={isProcessing} />
            <p className="text-xs text-muted-foreground mt-1">{t('analyzer.batchingNote')}</p>

            <div className="mt-4">
              <AdvancedOptions
                operation={operation}
                guesser={guesser}
                onGuesserChange={setGuesser}
                inputFormat={inputFormat}
                onInputFormatChange={setInputFormat}
                derivation={derivation}
                onDerivationChange={setDerivation}
                convertTagset={convertTagset}
                onConvertTagsetChange={setConvertTagset}
                disabled={isProcessing}
              />
            </div>

            <div className="mt-6 flex justify-end">
              {isProcessing ? (
                <Button variant="danger" onClick={handleCancel} className="w-full sm:w-auto">
                  {t('common.cancel')}
                </Button>
              ) : (
                <Button
                  onClick={() => void handleProcess()}
                  disabled={!inputText.trim() || !selectedModel}
                  className="w-full sm:w-auto"
                >
                  {t(`design.process.${operation}`)}
                </Button>
              )}
            </div>
          </div>

          <div className="analyzer-log min-h-[clamp(10rem,25vh,18rem)] max-h-[50vh] min-w-0">
            <LogPanel logs={logs} onClear={() => setLogs([])} />
          </div>
        </div>

        <div className="analyzer-results flex min-w-0 flex-col w-full min-h-[clamp(18rem,60vh,42rem)]">
          {result ? (
            <div className="bg-card border border-border rounded-xl p-4 sm:p-6 shadow-sm flex flex-col h-full">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
                <h2 className="text-xl font-semibold text-foreground">{t('analyzer.results_title')}</h2>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => void handleSave()} disabled={isSaving}>
                    {isSaving ? t('common.loading') : t('analyzer.save')}
                  </Button>
                  <ExportMenu onExport={(format) => void handleExport(format)} />
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                <ResultPanel result={result} operation={completed!.operation} />
              </div>
            </div>
          ) : (
            <div className="bg-card border border-border border-dashed rounded-xl p-6 shadow-sm flex flex-col items-center justify-center h-full text-muted-foreground min-h-[clamp(18rem,60vh,42rem)]">
               <svg aria-hidden="true" className="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
              </svg>
              <p className="text-center">{t('analyzer.no_result_placeholder')}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
