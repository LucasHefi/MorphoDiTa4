import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useWizardStore } from '../../store/useWizardStore';
import { useApiStore } from '../../store/useApiStore';
import { MorphoDiTaAPI } from '../../services/api';
import { DatabaseService } from '../../services/database';
import { parseInputText, cleanLemma } from '../../services/filters';
import { deduplicateWizardWords, getWizardInputError } from '../../services/wizardInput';
import { buildWizardRelations, expandWizardTagGroups, WizardTaggingContractError } from '../../services/wizardPipeline';
import { ProgressBar, Spinner, Button } from '../common';
import { LogPanel, type LogEntry } from '../analyzer/LogPanel';
import { splitText, processInBatches, getBatchSize } from '../../services/batcher';

const AnalyzerLogPanel = LogPanel;

type LogLevel = LogEntry['level'];

export const WizardProcessing: React.FC = () => {
  const { t } = useTranslation();
  const { keywordsText, processingResult, setProcessingResult, setStep, setRunState, cancel, resume, run } = useWizardStore();
  const { selectedModel } = useApiStore();
  const { status: runStatus, sessionId: runSessionId, completedPhase: runCompletedPhase, checkpoint: runCheckpoint } = run;

  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const hasStarted = useRef(false);
  const abortController = useRef<AbortController | null>(null);
  const attemptRef = useRef(0);
  const mountedRef = useRef(false);
  const sourceKeyRef = useRef<string | null>(null);

  const persistedCompletionMatchesSource = (
    runStatus === 'ready' || runStatus === 'saved'
  ) && Boolean(
    runCheckpoint
      && runCheckpoint.source.input === keywordsText
      && runCheckpoint.source.model === selectedModel,
  );

  useEffect(() => {
    if (!persistedCompletionMatchesSource) return;
    hasStarted.current = true;
    setIsProcessing(false);
    setIsFinished(true);
    setProgress(100);
  }, [persistedCompletionMatchesSource]);

  const addLog = (level: LogLevel, message: string) => {
    if (!mountedRef.current) return;
    setLogs((previous) => [...previous, {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      level,
      message,
    }]);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      hasStarted.current = false;
      attemptRef.current += 1;
      abortController.current?.abort();
      abortController.current = null;
    };
  }, []);

  useEffect(() => {
    const processKeywords = async () => {
      const phaseNumber = (phase: typeof runCompletedPhase) =>
        ({ none: 0, lookup: 1, analysis: 2, generation: 3, ready: 4, saved: 5 }[phase]);
      const sourceKey = `${keywordsText}\u0000${selectedModel ?? ''}`;
      if (sourceKeyRef.current !== sourceKey) {
        sourceKeyRef.current = sourceKey;
        attemptRef.current += 1;
        abortController.current?.abort();
        abortController.current = null;
      }
      const attemptId = ++attemptRef.current;
      abortController.current?.abort();
      abortController.current = new AbortController();
      const signal = abortController.current.signal;
      const isCurrent = () => mountedRef.current && attemptRef.current === attemptId && !signal.aborted;
      const ensureCurrent = () => {
        if (!isCurrent()) throw new DOMException('The operation was aborted', 'AbortError');
      };
      await Promise.resolve();
      ensureCurrent();
      const checkpointMatchesSource = !runCheckpoint || (
        runCheckpoint.source.input === keywordsText
        && runCheckpoint.source.model === selectedModel
      );
      const resultMatchesSource = !processingResult || processingResult.model === selectedModel;
      if (!checkpointMatchesSource || !resultMatchesSource) {
        hasStarted.current = false;
        setIsFinished(false);
        setProcessingResult(null);
        setRunState({ status: 'idle', sessionId: '', completedPhase: 'none', checkpoint: undefined, error: undefined });
        return;
      }
      if (!selectedModel) {
        setIsProcessing(false);
        setRunState({ status: 'failed', error: t('wizard.processing_error') });
        addLog('ERROR', t('wizard.processing_error'));
        return;
      }
      setIsProcessing(true);
      setIsFinished(false);
      const checkpoint = checkpointMatchesSource
        ? runCheckpoint
        : undefined;
      const sessionId = checkpoint && runSessionId ? runSessionId : `wizard-${Date.now()}`;
      setRunState({
        status: 'processing',
        sessionId,
        completedPhase: checkpoint ? runCompletedPhase : 'none',
        checkpoint,
        error: undefined,
      });
      setProgress(0);
       addLog('INFO', t('wizard.processing.start'));

      try {
        const wordsForTagging = parseInputText(keywordsText);
         addLog('DEBUG', t('wizard.processing.wordCount', { count: wordsForTagging.length }));

        const inputError = getWizardInputError(keywordsText);
        if (inputError) {
          if (inputError.code === 'too-many-words') {
             throw new Error(t('wizard.processing.tooManyWords', { maxWords: inputError.maxWords }));
          }
           throw new Error(t('wizard.processing.inputReadFailed'));
        }

        if (wordsForTagging.length === 0) {
          throw new Error(t('wizard.processing_error'));
        }

        const lookupWords = deduplicateWizardWords(wordsForTagging);
        let newWords: string[];
        if (checkpoint && phaseNumber(runCompletedPhase) >= phaseNumber('lookup')) {
          newWords = checkpoint.lookup.newWords;
        } else {
           addLog('INFO', t('wizard.processing.lookup'));
          const existingWords = new Set(await DatabaseService.wordFormsExist(lookupWords));
          ensureCurrent();
          newWords = lookupWords.filter((word) => !existingWords.has(word));
          ensureCurrent();
          setRunState({ completedPhase: 'lookup', checkpoint: { source: { input: keywordsText, model: selectedModel }, lookup: { newWords } } });
        }
        ensureCurrent();
         addLog('DEBUG', t('wizard.processing.newWords', { count: newWords.length }));

        setProgress(20);

         addLog('INFO', t('wizard.processing.analyzing'));
        const taggingWords = lookupWords;
        const joinedWords = taggingWords.join('\n');
        const batchSize = getBatchSize();
        const wordChunks = splitText(joinedWords, batchSize);
        let tagResult = checkpoint?.analysis?.taggedTokens ?? [];
        let uniqueLemmas = checkpoint?.analysis?.lemmas ?? [];
        if (!checkpoint || phaseNumber(runCompletedPhase) < phaseNumber('analysis') || !checkpoint.analysis) {
          const tagResponses = await processInBatches(
            wordChunks,
            (chunk) => MorphoDiTaAPI.tagText(chunk, selectedModel, 'json', { signal }),
            (completed) => {
              if (isCurrent()) setProgress(20 + (completed / Math.max(wordChunks.length, 1)) * 30);
            },
            { signal },
          );
          ensureCurrent();
          const tagGroups = tagResponses.flatMap((response) => response.result);
          tagResult = expandWizardTagGroups(taggingWords, wordsForTagging, tagGroups);
          const rawLemmas = tagResult.map((item) => cleanLemma(item.lemma));
          uniqueLemmas = Array.from(new Set(rawLemmas.filter((lemma) => lemma.length > 0)));
          ensureCurrent();
          setRunState({ completedPhase: 'analysis', checkpoint: { source: { input: keywordsText, model: selectedModel }, lookup: { newWords }, analysis: { taggedTokens: tagResult, lemmas: uniqueLemmas } } });
        }
        ensureCurrent();
        setProgress(50);
         addLog('DEBUG', t('wizard.processing.tagged', { count: tagResult.length }));
         addLog('INFO', t('wizard.processing.lemmas', { count: uniqueLemmas.length }));

        const lemmaChunks = splitText(uniqueLemmas.join('\n'), batchSize);
        let generateResult = checkpoint?.generation?.forms ?? [];
        if (!checkpoint || phaseNumber(runCompletedPhase) < phaseNumber('generation') || !checkpoint.generation) {
          const generateResponses = await processInBatches(
            lemmaChunks,
            (chunk) => MorphoDiTaAPI.generateForms(chunk, selectedModel, true, undefined, 'json', { signal }),
            (completed) => {
              if (isCurrent()) setProgress(50 + (completed / Math.max(lemmaChunks.length, 1)) * 30);
            },
            { signal },
          );
          ensureCurrent();
          generateResult = generateResponses.flatMap((response) => response.result).flat();
          ensureCurrent();
          setRunState({ completedPhase: 'generation', checkpoint: { source: { input: keywordsText, model: selectedModel }, lookup: { newWords }, analysis: { taggedTokens: tagResult, lemmas: uniqueLemmas }, generation: { forms: generateResult } } });
        }
        ensureCurrent();
        setProgress(80);
         addLog('DEBUG', t('wizard.processing.generated'));

        const relations = buildWizardRelations(tagResult, generateResult, sessionId);

        ensureCurrent();
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
        ensureCurrent();
        setProgress(100);
        setRunState({ status: 'ready', completedPhase: 'ready' });
         addLog('INFO', t('wizard.processing.success'));
        setIsFinished(true);
      } catch (error) {
        if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
          if (!isCurrent()) return;
          setRunState({ status: 'cancelled' });
           addLog('WARNING', t('wizard.processing.cancelled'));
          return;
        }
        if (!isCurrent()) return;
        setRunState({ status: 'failed', error: error instanceof WizardTaggingContractError ? t('wizard.processing.taggingContractMismatch') : error instanceof Error ? error.message : String(error) });
         addLog('ERROR', t('wizard.processing.error', { message: error instanceof Error ? error.message : String(error) }));
      } finally {
        if (attemptRef.current === attemptId) abortController.current = null;
        if (mountedRef.current) setIsProcessing(false);
      }
    };

    const checkpointSourceMismatch = Boolean(
      runCheckpoint && (runCheckpoint.source.input !== keywordsText || runCheckpoint.source.model !== selectedModel),
    );
    const resultSourceMismatch = Boolean(processingResult && processingResult.model !== selectedModel);
    const sourceMismatch = checkpointSourceMismatch || (resultSourceMismatch && !persistedCompletionMatchesSource);
    if ((sourceMismatch || runStatus === 'idle' || runStatus === 'processing') && !isProcessing && (sourceMismatch || !isFinished) && (sourceMismatch || !hasStarted.current)) {
      hasStarted.current = true;
      void processKeywords();
    }
  }, [keywordsText, selectedModel, processingResult, isProcessing, isFinished, runStatus, runCheckpoint, runSessionId, runCompletedPhase, persistedCompletionMatchesSource, setProcessingResult, setRunState, t]);

  const handleCancel = () => {
    abortController.current?.abort();
    cancel();
  };

  const handleResume = () => {
    hasStarted.current = false;
    setIsFinished(false);
    resume();
  };

  return (
    <div className="flex flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-300">
      <div className="flex flex-col gap-2">
           <h2 className="text-xl font-semibold text-foreground">{t('wizard.processing.title')}</h2>
         <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {isProcessing
             ? t('wizard.processing.working')
            : isFinished || persistedCompletionMatchesSource
               ? t('wizard.processing.complete')
              : run.status === 'failed'
                ? t('wizard.processing_error')
               : t('wizard.processing.preparing')}
        </p>
        {run.status === 'failed' && (
          <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <strong>{t('wizard.processing_error')}</strong>
            {run.error && <span className="ml-1">{run.error}</span>}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 flex items-center justify-center bg-secondary rounded-full">
            {isProcessing ? (
              <Spinner size="md" />
            ) : isFinished || persistedCompletionMatchesSource ? (
              <div className="text-green-500 font-bold text-xl">✓</div>
            ) : (
              <div className="text-muted-foreground font-bold">...</div>
            )}
          </div>
          <div className="flex-1">
             <ProgressBar progress={progress} label={t('wizard.processing.progress')} variant="gradient" />
          </div>
        </div>
      </div>

      <div className="min-h-[clamp(10rem,25vh,18rem)] max-h-[50vh]">
        <AnalyzerLogPanel logs={logs} onClear={() => setLogs([])} />
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={isProcessing ? handleCancel : run.status === 'cancelled' || run.status === 'failed' ? handleResume : () => setStep(1)}>
          {isProcessing ? t('wizard.cancel') : run.status === 'cancelled' || run.status === 'failed' ? t('wizard.resume') : t('wizard.back')}
        </Button>
        <Button onClick={() => setStep(3)} disabled={run.status !== 'ready' && run.status !== 'saved'} className="min-w-[120px]">
          {t('wizard.next')}
        </Button>
      </div>
    </div>
  );
};
