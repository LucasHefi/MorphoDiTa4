import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useWizardStore } from '../../store/useWizardStore';
import { Button, Card, CardHeader, CardTitle, CardContent, Input } from '../common';
import { applyFiltersToArray, canonicalKey, cleanLemma } from '../../services/filters';
import { selectWizardSources } from './wizardSummarySelectors';
import { WorkflowService } from '../../services/workflow';
import {
  downloadFile,
  exportToJson,
  exportToCsv,
} from '../../services/export';

export const WizardSummary: React.FC = () => {
  const { t } = useTranslation();
  const { processingResult, filters, setStep, setFilters, reset, setRunState } = useWizardStore();

  const [localFilters, setLocalFilters] = useState(filters);
  const [stopWordsInput, setStopWordsInput] = useState(filters.stopWordsList?.join(', ') || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [exportError, setExportError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const forms = useMemo(() => processingResult?.forms ?? [], [processingResult]);
  const taggedTokens = useMemo(() => processingResult?.taggedTokens ?? [], [processingResult]);
  const relations = useMemo(() => processingResult?.relations ?? [], [processingResult]);
  const model = processingResult?.model ?? '';
  const newWords = useMemo(() => processingResult?.newWords ?? [], [processingResult]);

  const newWordsSet = useMemo(
    () => new Set(newWords.map(canonicalKey)),
    [newWords],
  );

  const newLemmasSet = useMemo(
    () => new Set(
      relations
        .filter((relation) => newWordsSet.has(canonicalKey(relation.inputToken)))
        .map((relation) => canonicalKey(cleanLemma(relation.lemma)))
    ),
    [newWordsSet, relations],
  );

  const selectedSources = useMemo(
    () => selectWizardSources(taggedTokens, forms, Boolean(localFilters.showOnlyNew), newWordsSet, newLemmasSet),
    [forms, taggedTokens, localFilters.showOnlyNew, newWordsSet, newLemmasSet],
  );

  const formsToLemmas = useMemo(() => {
    const { taggedTokens: sourceTaggedTokens, forms: sourceForms } = selectedSources;
    const result: string[] = [];
    const seenRelationshipKeys = new Set<string>();
    [...sourceTaggedTokens.map((token) => ({ form: token.token, lemma: token.lemma })), ...sourceForms.map((item) => ({ form: item.form, lemma: item.lemma }))].forEach(({ form, lemma: rawLemma }) => {
      const lemma = cleanLemma(rawLemma);
      let displayLemma = lemma;
      const ignoreDiacritics = localFilters.removeDiacritics;
      if (ignoreDiacritics) {
        const filteredLemma = applyFiltersToArray([lemma], {
          ...localFilters,
          removeDuplicates: false,
          removeStopWords: false,
          removeSpecialCharacters: false,
        });
        if (filteredLemma.length > 0) displayLemma = filteredLemma[0];
      }

      const comparisonOptions = { ...localFilters, removeDuplicates: false };
      const filteredFormForCompare = applyFiltersToArray([form], comparisonOptions)[0];
      const filteredLemmaForCompare = applyFiltersToArray([displayLemma], comparisonOptions)[0];
      if (filteredFormForCompare === undefined || filteredLemmaForCompare === undefined) return;
      const formCompare = filteredFormForCompare === undefined ? undefined : canonicalKey(filteredFormForCompare);
      const lemmaCompare = filteredLemmaForCompare === undefined ? undefined : canonicalKey(filteredLemmaForCompare);

      if (localFilters.removeDuplicates && formCompare !== undefined && formCompare === lemmaCompare) return;

      const filteredForm = applyFiltersToArray([form], localFilters);
      if (filteredForm.length > 0) {
        const relationship = `${filteredForm[0]} = ${displayLemma}`;
        if (localFilters.removeDuplicates && formCompare !== undefined) {
          const relationshipKey = `${formCompare} = ${lemmaCompare ?? canonicalKey(displayLemma)}`;
          if (seenRelationshipKeys.has(relationshipKey)) return;
          seenRelationshipKeys.add(relationshipKey);
        }
        result.push(relationship);
      }
    });
    return result.sort();
  }, [selectedSources, localFilters]);

  const filteredLemmas = useMemo(() => {
    const allLemmas = [
      ...selectedSources.taggedTokens.map((token) => cleanLemma(token.lemma)),
      ...selectedSources.forms.map((form) => cleanLemma(form.lemma)),
    ].filter((lemma) => lemma.length > 0);

    return applyFiltersToArray(allLemmas, localFilters).sort();
  }, [selectedSources, localFilters]);

  const filteredForms = useMemo(() => {
    const { taggedTokens: sourceTaggedTokens, forms: sourceForms } = selectedSources;

    const allForms = [
      ...sourceTaggedTokens.map((token) => token.token),
      ...sourceForms.map((form) => form.form),
    ].filter((form) => form.length > 0);

    return applyFiltersToArray(allForms, localFilters).sort();
  }, [selectedSources, localFilters]);

  if (!processingResult) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center motion-safe:animate-in motion-safe:fade-in">
        <p className="text-muted-foreground mb-4">{t('wizard.summary.empty')}</p>
        <Button onClick={() => setStep(1)}>{t('wizard.summary.backToInput')}</Button>
      </div>
    );
  }

  const handleApplyFilters = () => {
    setFilters({
      ...localFilters,
      stopWordsList: stopWordsInput
        .split(/[,\s;]+/)
        .map((word) => word.trim())
        .filter((word) => word.length > 0),
    });
  };

  const handleExport = async (format: 'csv' | 'json' | 'txt') => {
    if (exportStatus === 'pending') return;
    setExportStatus('pending');
    setExportError(null);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const timestamp = new Date().toISOString().slice(0, 10);
    const schemaVersion = 1;
    const exportData = { schemaVersion, model, filters: localFilters, formsToLemmas, filteredLemmas, filteredForms };
    try {
      if (format === 'json') {
        downloadFile(exportToJson(exportData), `wizard-results-${timestamp}.json`, 'application/json');
      } else if (format === 'csv') {
        const rows = [
          ...formsToLemmas.map((value) => ({ schemaVersion, model, section: 'formsToLemmas', value })),
          ...filteredLemmas.map((value) => ({ schemaVersion, model, section: 'filteredLemmas', value })),
          ...filteredForms.map((value) => ({ schemaVersion, model, section: 'filteredForms', value })),
        ];
        downloadFile(exportToCsv(rows, ['schemaVersion', 'model', 'section', 'value']), `wizard-results-${timestamp}.csv`, 'text/csv');
      } else {
        const combinedTxt = [
          `# schemaVersion: ${schemaVersion}`,
          `# model: ${model}`,
          `# filters: ${exportToJson(localFilters)}`,
          '',
           `# ${t('wizard.summary.exportFormsToLemmas')}`, ...formsToLemmas, '',
           `# ${t('wizard.summary.exportFilteredLemmas')}`, ...filteredLemmas, '',
           `# ${t('wizard.summary.exportFilteredForms')}`, ...filteredForms,
        ].join('\n');
        downloadFile(combinedTxt, `wizard-results-${timestamp}.txt`, 'text/plain');
      }
      setExportStatus('success');
    } catch (error) {
      setExportStatus('error');
      setExportError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleFinish = async () => {
    if (isSaving || saveSucceeded) return;
    const saveState = useWizardStore.getState();
    const saveRun = saveState.run;
    const saveResult = saveState.processingResult;
    const saveInput = saveState.keywordsText;
    const saveModel = model;
    const saveSource = saveRun.checkpoint?.source;
    const isCurrentSave = () => {
      const current = useWizardStore.getState();
      const currentSource = current.run.checkpoint?.source;
      return mountedRef.current
        && current.keywordsText === saveInput
        && current.processingResult === saveResult
        && current.run === saveRun
        && current.run.sessionId === saveRun.sessionId
        && currentSource?.input === saveSource?.input
        && currentSource?.model === saveSource?.model;
    };

    setIsSaving(true);
    setSaveError(null);
    try {
      await WorkflowService.saveWizardResults(taggedTokens, forms, saveModel, saveInput);
      if (!isCurrentSave()) return;
      setRunState({ status: 'saved', completedPhase: 'saved' });
      setSaveSucceeded(true);
    } catch (error) {
      if (!isCurrentSave()) return;
      const detail = error instanceof Error ? error.message : String(error);
      setRunState({ status: 'failed', error: detail });
      setSaveError(`${t('wizard.save_error')}: ${detail}`);
    } finally {
      if (mountedRef.current) setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-300">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-xl font-semibold text-foreground">{t('wizard.summary.title')}</h2>
           <p className="text-sm text-muted-foreground">{t('wizard.summary.description')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[clamp(14rem,30vh,22rem)] max-h-[60vh]">
        <Card glass className="flex flex-col overflow-hidden">
          <CardHeader className="py-2">
             <CardTitle className="text-sm">{t('wizard.summary.formsToLemmas', { count: formsToLemmas.length })}</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto text-xs font-mono">
            {formsToLemmas.map((item, index) => <div key={index}>{item}</div>)}
          </CardContent>
        </Card>
        <Card glass className="flex flex-col overflow-hidden">
          <CardHeader className="py-2">
             <CardTitle className="text-sm">{t('wizard.summary.lemmas', { count: filteredLemmas.length })}</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto text-xs">
            {filteredLemmas.join(', ')}
          </CardContent>
        </Card>
        <Card glass className="flex flex-col overflow-hidden">
          <CardHeader className="py-2">
             <CardTitle className="text-sm">{t('wizard.summary.forms', { count: filteredForms.length })}</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto text-xs">
            {filteredForms.join(', ')}
          </CardContent>
        </Card>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
         <h3 className="text-md font-semibold mb-4">{t('wizard.summary.filters')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center space-x-2">
            <input type="checkbox" checked={localFilters.removeDuplicates} onChange={(event) => setLocalFilters({ ...localFilters, removeDuplicates: event.target.checked })} className="rounded text-primary focus:ring-primary" />
             <span className="text-sm">{t('wizard.summary.removeDuplicates')}</span>
          </label>
          <label className="flex items-center space-x-2">
            <input type="checkbox" checked={localFilters.removeDiacritics} onChange={(event) => setLocalFilters({ ...localFilters, removeDiacritics: event.target.checked })} className="rounded text-primary focus:ring-primary" />
             <span className="text-sm">{t('wizard.summary.removeDiacritics')}</span>
          </label>
          <label className="flex items-center space-x-2">
            <input type="checkbox" checked={localFilters.removeSpecialCharacters} onChange={(event) => setLocalFilters({ ...localFilters, removeSpecialCharacters: event.target.checked })} className="rounded text-primary focus:ring-primary" />
             <span className="text-sm">{t('wizard.summary.removeSpecialCharacters')}</span>
          </label>
          <label className="flex items-center space-x-2">
            <input type="checkbox" checked={localFilters.removeStopWords} onChange={(event) => setLocalFilters({ ...localFilters, removeStopWords: event.target.checked })} className="rounded text-primary focus:ring-primary" />
             <span className="text-sm">{t('wizard.summary.removeStopWords')}</span>
          </label>
          <label className="flex items-center space-x-2">
            <input type="checkbox" checked={localFilters.showOnlyNew} onChange={(event) => setLocalFilters({ ...localFilters, showOnlyNew: event.target.checked })} className="rounded text-primary focus:ring-primary" />
             <span className="text-sm">{t('wizard.summary.showOnlyNew')}</span>
          </label>
        </div>

        {localFilters.removeStopWords && (
          <div className="mt-4">
            <Input
               label={t('wizard.summary.customStopWords')}
              value={stopWordsInput}
              onChange={(event) => setStopWordsInput(event.target.value)}
               placeholder={t('wizard.summary.stopWordsPlaceholder')}
            />
          </div>
        )}

        <div className="mt-4 flex justify-end">
           <Button variant="secondary" size="sm" onClick={handleApplyFilters} disabled={isSaving}>
             {t('wizard.summary.applyFilters')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap justify-between gap-3 mt-4">
         <Button variant="secondary" onClick={() => setStep(3)} disabled={isSaving}>
          {t('wizard.back')}
        </Button>
        <div className="flex flex-wrap gap-2">
           <Button variant="ghost" onClick={() => void handleExport('csv')} disabled={isSaving || exportStatus === 'pending'}>{t('wizard.summary.exportCsv')}</Button>
           <Button variant="ghost" onClick={() => void handleExport('json')} disabled={isSaving || exportStatus === 'pending'}>{t('wizard.summary.exportJson')}</Button>
           <Button variant="ghost" onClick={() => void handleExport('txt')} disabled={isSaving || exportStatus === 'pending'}>{t('wizard.summary.exportTxt')}</Button>
          <Button variant="primary" onClick={handleFinish} disabled={isSaving || saveSucceeded}>
             {isSaving ? t('wizard.summary.saving') : t('wizard.summary.finishSave')}
          </Button>
        </div>
      </div>
      {exportStatus === 'pending' && <div role="status" aria-live="polite">{t('wizard.export_pending')}</div>}
      {exportStatus === 'success' && <div role="status" aria-live="polite">{t('wizard.export_success')}</div>}
      {exportStatus === 'error' && <div role="alert">{t('wizard.export_error')}: {exportError}</div>}
      {saveError && (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {saveError}
        </div>
      )}
       {saveSucceeded && (
        <div role="status" aria-live="polite" className="status-success rounded-md border p-3 text-sm">
          <p>{t('wizard.save_success')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={reset}>{t('wizard.process_another')}</Button>
            <Button variant="ghost" onClick={() => setStep(1)}>{t('wizard.return_to_input')}</Button>
          </div>
        </div>
      )}
    </div>
  );
};
