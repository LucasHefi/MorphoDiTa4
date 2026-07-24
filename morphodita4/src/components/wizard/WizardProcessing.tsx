import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useWizardStore } from '../../store/useWizardStore';
import { useApiStore } from '../../store/useApiStore';
import { MorphoDiTaAPI } from '../../services/api';
import { DatabaseService } from '../../services/database';
import { parseInputText, cleanLemma } from '../../services/filters';
import { buildWizardRelations } from '../../services/wizardPipeline';
import { ProgressBar, Spinner, Button } from '../common';
import { LogPanel, type LogEntry } from '../analyzer/LogPanel';
import { splitText, processInBatches, getBatchSize } from '../../services/batcher';

const AnalyzerLogPanel = LogPanel;

type LogLevel = LogEntry['level'];

export const WizardProcessing: React.FC = () => {
  const { t } = useTranslation();
  const { keywordsText, setProcessingResult, setStep } = useWizardStore();
  const { selectedModel } = useApiStore();

  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const hasStarted = useRef(false);

  const addLog = (level: LogLevel, message: string) => {
    setLogs((previous) => [...previous, {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      level,
      message,
    }]);
  };

  useEffect(() => {
    const processKeywords = async () => {
      if (!selectedModel) {
        addLog('ERROR', 'Není vybrán žádný model.');
        return;
      }

      setIsProcessing(true);
      setProgress(0);
      addLog('INFO', 'Zahajuji zpracování klíčových slov...');

      try {
        const wordsForTagging = parseInputText(keywordsText);
        addLog('DEBUG', `Počet slov k analýze: ${wordsForTagging.length}`);

        addLog('INFO', 'Kontroluji existenci slov v databázi...');
        const newWords: string[] = [];
        for (const word of wordsForTagging) {
          const exists = await DatabaseService.wordFormExists(word);
          if (!exists) {
            newWords.push(word);
          }
        }
        addLog('DEBUG', `Nalezeno ${newWords.length} nových slov.`);

        setProgress(20);

        if (wordsForTagging.length === 0) {
          addLog('WARNING', 'Po zpracování vstupu nezbyla žádná slova ke zpracování.');
          setIsProcessing(false);
          setIsFinished(true);
          return;
        }

        addLog('INFO', 'Odesílám data k morfologické analýze...');
        const joinedWords = wordsForTagging.join('\n');
        const batchSize = getBatchSize();
        const wordChunks = splitText(joinedWords, batchSize);
        const tagResponses = await processInBatches(
          wordChunks,
          (chunk) => MorphoDiTaAPI.tagText(chunk, selectedModel),
        );
        const tagResult = tagResponses.flatMap((response) => response.result).flat();
        setProgress(50);
        addLog('DEBUG', `Tagování dokončeno: ${tagResult.length} tokenů.`);

        const rawLemmas = tagResult.map((item) => cleanLemma(item.lemma));
        const uniqueLemmas = Array.from(new Set(rawLemmas.filter((lemma) => lemma.length > 0)));
        addLog('INFO', `Získáno ${uniqueLemmas.length} unikátních lemmat. Generuji formy...`);

        const lemmaChunks = splitText(uniqueLemmas.join('\n'), batchSize);
        const generateResponses = await processInBatches(
          lemmaChunks,
          (chunk) => MorphoDiTaAPI.generateForms(chunk, selectedModel),
        );
        const generateResult = generateResponses.flatMap((response) => response.result).flat();
        setProgress(80);
        addLog('DEBUG', 'Generování dokončeno.');

        const relations = buildWizardRelations(tagResult, generateResult);

        setProcessingResult({
          inputWords: wordsForTagging.length,
          newWords,
          uniqueLemmas: uniqueLemmas.length,
          lemmas: uniqueLemmas,
          forms: generateResult,
          taggedTokens: tagResult,
          relations,
          model: selectedModel,
        });
        setProgress(100);
        addLog('INFO', 'Zpracování úspěšně dokončeno.');
        setIsFinished(true);
      } catch (error) {
        console.error(error);
        addLog('ERROR', `Chyba při zpracování: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setIsProcessing(false);
      }
    };

    if (keywordsText && !isProcessing && !isFinished && !hasStarted.current) {
      hasStarted.current = true;
      void processKeywords();
    }
  }, [keywordsText, selectedModel, isProcessing, isFinished, setProcessingResult]);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">Zpracování</h2>
        <p className="text-sm text-muted-foreground">
          {isProcessing
            ? 'Probíhá zpracování vašich dat, čekejte prosím...'
            : isFinished
              ? 'Zpracování dokončeno.'
              : 'Připravuji...'}
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 flex items-center justify-center bg-secondary rounded-full">
            {isProcessing ? (
              <Spinner size="md" />
            ) : isFinished ? (
              <div className="text-green-500 font-bold text-xl">✓</div>
            ) : (
              <div className="text-muted-foreground font-bold">...</div>
            )}
          </div>
          <div className="flex-1">
            <ProgressBar progress={progress} label="Celkový postup" variant="gradient" />
          </div>
        </div>
      </div>

      <div className="h-[300px]">
        <AnalyzerLogPanel logs={logs} onClear={() => setLogs([])} />
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={() => setStep(1)} disabled={isProcessing}>
          {t('wizard.back')}
        </Button>
        <Button onClick={() => setStep(3)} disabled={!isFinished} className="min-w-[120px]">
          {t('wizard.next')}
        </Button>
      </div>
    </div>
  );
};
