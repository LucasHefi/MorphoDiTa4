import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApiStore } from '../store/useApiStore';
import { MorphoDiTaAPI } from '../services/api';
import { OperationType } from '../types/common';
import { splitText, processInBatches, getBatchSize } from '../services/batcher';
import { 
  ModelSelector, 
  OperationSelector, 
  TextInput, 
  AdvancedOptions, 
  ResultPanel, 
  LogPanel, 
  ExportMenu 
} from '../components/analyzer';
import { 
  exportToJson, 
  downloadFile, 
  exportMorphologicalTagsToCsv, 
  exportMorphologicalTagsToTxt 
} from '../services/export';
import { Button } from '../components/common';
import { LogEntry } from '../components/analyzer/LogPanel';

export const AnalyzerPage: React.FC = () => {
  const { t } = useTranslation();
  const { selectedModel } = useApiStore();

  const [operation, setOperation] = useState<OperationType>('analyze');
  const [inputText, setInputText] = useState('');
  
  // Advanced options state
  const [guesser, setGuesser] = useState(true);
  const [inputFormat, setInputFormat] = useState<'untokenized' | 'vertical'>('untokenized');
  const [derivation, setDerivation] = useState<'none' | 'root' | 'path' | 'tree'>('none');
  const [convertTagset, setConvertTagset] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = (level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR', message: string) => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      level,
      message
    }]);
  };

  const handleProcess = async () => {
    if (!selectedModel) {
      addLog('ERROR', 'Vyberte model pro analýzu.');
      return;
    }
    if (!inputText.trim()) {
      addLog('WARNING', 'Zadejte text k analýze.');
      return;
    }

    setIsProcessing(true);
    setResult(null);
    addLog('INFO', `Zahajuji operaci: ${operation}`);

    try {
      const batchSize = getBatchSize();
      const chunks = splitText(inputText, batchSize);
      if (chunks.length > 1) {
        addLog('INFO', t('analyzer.batchingNote'));
      }
      let res;
      switch (operation) {
        case 'tag':
          const tagRs = await processInBatches(chunks, (c) => MorphoDiTaAPI.tagText(c, selectedModel));
          res = { result: tagRs.flatMap(r => r.result) };
          break;
        case 'analyze':
          const analyzeRs = await processInBatches(chunks, (c) => MorphoDiTaAPI.analyzeText(c, selectedModel, guesser, inputFormat, derivation, convertTagset));
          res = { result: analyzeRs.flatMap(r => r.result) };
          break;
        case 'generate':
          const genRs = await processInBatches(chunks, (c) => MorphoDiTaAPI.generateForms(c, selectedModel, guesser, convertTagset));
          res = { result: genRs.flatMap(r => r.result) };
          break;
        case 'tokenize':
          const tokRs = await processInBatches(chunks, (c) => MorphoDiTaAPI.tokenizeText(c, selectedModel));
          res = { result: tokRs.flatMap(r => r.result) };
          break;
      }
      setResult(res?.result);
      addLog('INFO', 'Operace úspěšně dokončena.');
    } catch (error) {
      addLog('ERROR', `Chyba: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = (format: 'csv' | 'json' | 'txt') => {
    if (!result) return;
    
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `morphodita-result-${operation}-${timestamp}.${format}`;
    
    switch (format) {
      case 'csv':
        downloadFile(exportMorphologicalTagsToCsv(result), filename, 'text/csv');
        break;
      case 'json':
        downloadFile(exportToJson(result), filename, 'application/json');
        break;
      case 'txt':
        downloadFile(exportMorphologicalTagsToTxt(result), filename, 'text/plain');
        break;
    }
    addLog('INFO', `Export do ${format.toUpperCase()} dokončen: ${filename}`);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 container max-w-7xl py-6 sm:py-8 px-4 sm:px-8 flex flex-col lg:flex-row gap-6 animate-in fade-in duration-300">
        
        {/* Left Column - Input & Controls */}
        <div className="flex flex-col gap-4 w-full lg:w-[45%] xl:w-[35%] lg:max-h-[calc(100vh-8rem)] lg:sticky lg:top-20">
          <div className="bg-card border border-border rounded-xl p-4 sm:p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4 text-foreground">{t('home.analyzer.title')}</h2>
            
            <ModelSelector />
            
            <OperationSelector 
              selectedOperation={operation} 
              onOperationChange={setOperation} 
            />

            <TextInput 
              value={inputText} 
              onChange={setInputText} 
              disabled={isProcessing} 
            />
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
              />
            </div>

            <div className="mt-6 flex justify-end">
              <Button 
                onClick={handleProcess} 
                isLoading={isProcessing}
                disabled={!inputText.trim() || !selectedModel}
                className="w-full sm:w-auto"
              >
                {t('analyzer.process')}
              </Button>
            </div>
          </div>

          <div className="h-[250px] lg:flex-1">
            <LogPanel logs={logs} onClear={() => setLogs([])} />
          </div>
        </div>

        {/* Right Column - Results */}
        <div className="flex flex-col w-full lg:flex-1 min-h-[400px]">
          {result ? (
            <div className="bg-card border border-border rounded-xl p-4 sm:p-6 shadow-sm flex flex-col h-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
        <h2 className="text-xl font-semibold text-foreground">{t('analyzer.results_title')}</h2>
        <ExportMenu onExport={handleExport} />
      </div>
              <div className="flex-1 overflow-auto">
                <ResultPanel result={result} operation={operation} />
              </div>
            </div>
          ) : (
            <div className="bg-card border border-border border-dashed rounded-xl p-6 shadow-sm flex flex-col items-center justify-center h-full text-muted-foreground min-h-[400px]">
              <svg className="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
