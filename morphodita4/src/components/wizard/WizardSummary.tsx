import { PagedValues } from './ResultPagination';
import { Copy, Download, Pencil } from 'lucide-react';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useWizardStore } from '../../store/useWizardStore';
import { Button, Card, CardHeader, CardTitle, CardContent } from '../common';
import { DatabaseService } from '../../services/database';
import { canonicalKey, removeDiacritics } from '../../services/filters';
import { readSummarySettings, writeSummarySettings, summaryRows, filterColumn, visibleDatabaseRows, type ColumnId, type ColumnFilters } from './summaryFilters';
import { WorkflowService } from '../../services/workflow';
import {
  downloadFile,
  exportToJson,
  downloadWizardCsv,
} from '../../services/export';

export const WizardSummary: React.FC = () => {
  const { t } = useTranslation();
  const { processingResult, setStep, reset, setRunState } = useWizardStore();

  const [settings, setSettings] = useState(readSummarySettings);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [forbiddenInput, setForbiddenInput] = useState(settings.forbiddenWords.join('\n'));
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupPending, setLookupPending] = useState(false);
  const [lookupReady, setLookupReady] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { writeSummarySettings(settings); }, [settings]);
  useEffect(() => { if (dialogOpen) dialogRef.current?.showModal(); }, [dialogOpen]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [exportPath, setExportPath] = useState<string | undefined>();
  const [exportError, setExportError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const forms = useMemo(() => processingResult?.forms ?? [], [processingResult]);
  const taggedTokens = useMemo(() => processingResult?.taggedTokens ?? [], [processingResult]);
  const model = processingResult?.model ?? '';
  const rows = useMemo(() => summaryRows(taggedTokens, forms), [taggedTokens, forms]);
  const lookupNeeded = Object.values(settings.columns).some((column) => column.existing);
  useEffect(() => {
    if (!lookupNeeded) return;
    let active = true;
    const words = [...new Set(rows.flatMap((row) => [row.value, row.lemma ?? '', removeDiacritics(row.value), removeDiacritics(row.lemma ?? '')]).filter(Boolean))];
    setLookupPending(true); setLookupReady(false); setLookupError(null);
    void (async () => {
      const matches: string[] = [];
      for (let i = 0; i < words.length; i += 5000) matches.push(...await DatabaseService.wordFormsExist(words.slice(i, i + 5000), true));
      if (active) { setExisting(new Set(matches.map(canonicalKey))); setLookupReady(true); }
    })().catch((error) => { if (active) setLookupError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (active) setLookupPending(false); });
    return () => { active = false; };
  }, [rows, lookupNeeded]);
  const results = useMemo(() => Object.fromEntries((['relations', 'lemmas', 'forms'] as const).map((id) => [id,
    settings.columns[id].existing && (lookupPending || !lookupReady || lookupError) ? [] : filterColumn(rows, id, settings.columns[id], settings.forbiddenWords, existing),
  ])) as Record<ColumnId, string[]>, [rows, settings, existing, lookupPending, lookupReady, lookupError]);
  const formsToLemmas = results.relations, filteredLemmas = results.lemmas, filteredForms = results.forms;
  const localFilters = settings;
  const setColumnFilter = (id: ColumnId, key: keyof ColumnFilters, value: boolean) => {
    if (key === 'existing' && value && !lookupNeeded) setLookupReady(false);
    setSettings((previous) => ({
      ...previous, columns: { ...previous.columns, [id]: { ...previous.columns[id], [key]: value } },
    }));
  };
  const copyColumn = async (id: ColumnId) => {
    try { await navigator.clipboard.writeText(results[id].join('\n')); setCopyStatus(t('wizard.summaryColumns.copied')); }
    catch { setCopyStatus(t('wizard.summaryColumns.copyError')); }
  };

  if (!processingResult) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center motion-safe:animate-in motion-safe:fade-in">
        <p className="text-muted-foreground mb-4">{t('wizard.summary.empty')}</p>
        <Button onClick={() => setStep(1)}>{t('wizard.summary.backToInput')}</Button>
      </div>
    );
  }

  const handleExport = async (format: 'csv' | 'json' | 'txt') => {
    if (exportStatus === 'pending') return;
    setExportStatus('pending');
    setExportError(null);
    setExportPath(undefined);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const timestamp = new Date().toISOString().slice(0, 10);
    const schemaVersion = 1;
    const exportData = { schemaVersion, model, lemmaModel: processingResult.lemmaModel, filters: localFilters, formsToLemmas, filteredLemmas, filteredForms };
    try {
      if (format === 'json') {
        setExportPath(await downloadFile(exportToJson(exportData), `wizard-results-${timestamp}.json`, 'application/json'));
      } else if (format === 'csv') {
        setExportPath(await downloadWizardCsv([
          { section: 'formsToLemmas', values: formsToLemmas },
          { section: 'filteredLemmas', values: filteredLemmas },
          { section: 'filteredForms', values: filteredForms },
        ], model, schemaVersion, `wizard-results-${timestamp}.csv`));
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
        setExportPath(await downloadFile(combinedTxt, `wizard-results-${timestamp}.txt`, 'text/plain'));
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
      await WorkflowService.saveWizardResults(taggedTokens, forms, saveModel, saveInput, visibleDatabaseRows(results, rows, settings));
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

      <p className="text-sm text-muted-foreground">{t('wizard.result_model')}: <span className="font-mono break-all">{model}</span></p>

      <div className="summary-columns grid grid-cols-1 md:grid-cols-3 gap-4 min-w-0">
        {(['relations', 'lemmas', 'forms'] as const).map((id) => (
          <Card glass key={id} className="flex flex-col min-w-0 overflow-hidden">
            <CardHeader className="py-3"><CardTitle className="text-sm break-words">{t(`wizard.summaryColumns.${id}`)} ({results[id].length})</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3 min-w-0">
              <fieldset className="grid gap-1 text-sm"><legend className="sr-only">{t('wizard.summary.filters')}: {t(`wizard.summaryColumns.${id}`)}</legend>
                {(['duplicates', 'diacritics', 'forbidden', 'functionWords', 'existing'] as const).map((key) => (
                  <label key={key} className="flex items-start gap-2"><input type="checkbox" disabled={isSaving} checked={settings.columns[id][key]} onChange={(event) => setColumnFilter(id, key, event.target.checked)} /> <span>{t(`wizard.summaryColumns.${key}`)}</span></label>
                ))}
              </fieldset>
              <Button variant="secondary" size="sm" onClick={() => void copyColumn(id)} disabled={settings.columns[id].existing && (lookupPending || !lookupReady || Boolean(lookupError))}><Copy size={16} aria-hidden="true" className="mr-2" />{t('wizard.summaryColumns.copy')}</Button>
              <PagedValues values={results[id]} label={t(`wizard.summaryColumns.${id}`)} />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="summary-notes"><p className="text-sm text-muted-foreground">{t('wizard.summaryColumns.functionNote')}</p>
      <div className="flex flex-wrap gap-3 items-center"><Button variant="secondary" disabled={isSaving} onClick={() => setDialogOpen(true)}>{t('wizard.summaryColumns.editForbidden')}</Button>
        {lookupPending && <span role="status">{t('wizard.summaryColumns.checking')}</span>}
        {lookupError && <span role="alert">{t('wizard.summaryColumns.databaseError')}: {lookupError}</span>}
        {copyStatus && <span role="status">{copyStatus}</span>}
      </div>
      </div>
      <dialog ref={dialogRef} aria-labelledby="forbidden-dialog-title" onClose={() => setDialogOpen(false)} className="max-w-xl w-[90vw] rounded-xl bg-card text-foreground p-6 backdrop:bg-black/60">
        <div className="dialog-icon status-info"><Pencil size={30} aria-hidden="true" /></div>
        <h3 id="forbidden-dialog-title" className="text-lg font-semibold">{t('wizard.summaryColumns.editForbidden')}</h3>
        <label className="block mt-3" htmlFor="forbidden-words">{t('wizard.summaryColumns.forbiddenHelp')}</label>
        <textarea id="forbidden-words" className="w-full h-48 mt-2 rounded border border-input bg-background p-2" value={forbiddenInput} onChange={(event) => setForbiddenInput(event.target.value)} />
        <div className="flex justify-end gap-2 mt-4"><Button variant="secondary" onClick={() => { setForbiddenInput(settings.forbiddenWords.join('\n')); dialogRef.current?.close(); }}>{t('wizard.summaryColumns.cancel')}</Button>
          <Button onClick={() => { setSettings((prev) => ({ ...prev, forbiddenWords: forbiddenInput.split(/[,;\s]+/u).filter(Boolean) })); dialogRef.current?.close(); }}>{t('wizard.summaryColumns.save')}</Button></div>
      </dialog>

      <div className="wizard-actions flex flex-wrap justify-between gap-3 mt-4">
         <Button variant="secondary" onClick={() => setStep(3)} disabled={isSaving}>
          {t('wizard.back')}
        </Button>
        <div className="flex flex-wrap gap-2">
           <Button variant="ghost" onClick={() => void handleExport('csv')} disabled={isSaving || exportStatus === 'pending' || (lookupNeeded && (lookupPending || !lookupReady || Boolean(lookupError)))}><Download size={16} aria-hidden="true" className="mr-2" />{t('wizard.summary.exportCsv')}</Button>
           <Button variant="ghost" onClick={() => void handleExport('json')} disabled={isSaving || exportStatus === 'pending' || (lookupNeeded && (lookupPending || !lookupReady || Boolean(lookupError)))}><Download size={16} aria-hidden="true" className="mr-2" />{t('wizard.summary.exportJson')}</Button>
           <Button variant="ghost" onClick={() => void handleExport('txt')} disabled={isSaving || exportStatus === 'pending' || (lookupNeeded && (lookupPending || !lookupReady || Boolean(lookupError)))}><Download size={16} aria-hidden="true" className="mr-2" />{t('wizard.summary.exportTxt')}</Button>
          <Button variant="primary" onClick={handleFinish} disabled={isSaving || saveSucceeded || (lookupNeeded && (lookupPending || !lookupReady || Boolean(lookupError)))}>
             {isSaving ? t('wizard.summary.saving') : t('wizard.summary.finishSave')}
          </Button>
        </div>
      </div>
      {exportStatus === 'pending' && <div role="status" aria-live="polite">{t('wizard.export_pending')}</div>}
      {exportStatus === 'success' && <div role="status" aria-live="polite">{t('wizard.export_success')}{exportPath && <div className="break-all">{exportPath}</div>}</div>}
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
