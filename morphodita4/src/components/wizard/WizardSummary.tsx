import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useWizardStore } from '../../store/useWizardStore';
import { Button, Card, CardHeader, CardTitle, CardContent, Input } from '../common';
import { applyFiltersToArray, cleanLemma, removeSpecialCharacters, removeDiacritics } from '../../services/filters';
import { WorkflowService } from '../../services/workflow';
import { 
  downloadFile, 
  exportToJson, 
  exportStringArrayToCsv 
} from '../../services/export';

export const WizardSummary: React.FC = () => {
  const { t } = useTranslation();
  const { keywordsText, processingResult, filters, setStep, setFilters, reset } = useWizardStore();

  const [localFilters, setLocalFilters] = useState(filters);
  const [stopWordsInput, setStopWordsInput] = useState(filters.stopWordsList?.join(', ') || '');
  const [isSaving, setIsSaving] = useState(false);

  if (!processingResult) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
        <p className="text-muted-foreground mb-4">Nejsou k dispozici žádné výsledky k shrnutí.</p>
        <Button onClick={() => setStep(1)}>Zpět na zadání</Button>
      </div>
    );
  }

  const { forms, taggedTokens, model, newWords } = processingResult;
  
  const newWordsSet = useMemo(() => new Set((newWords as string[] || []).map((w: string) => w.toLowerCase())), [newWords]);

  // Panel 1: Formy = Lemma
  const formsToLemmas = useMemo(() => {
    const mapping = new Map<string, string>();
    
    // Filter source data if "Show only new words" is active
    const sourceTaggedTokens = localFilters.showOnlyNew 
      ? taggedTokens?.filter((t: any) => newWordsSet.has(t.token.toLowerCase()))
      : taggedTokens;
      
    const sourceForms = localFilters.showOnlyNew
      ? forms?.filter((f: any) => {
          const cleanedF = cleanLemma(f.lemma).toLowerCase();
          // If the lemma of the generated form came from a new word's lemma
          return Array.from(newWordsSet).some(nw => cleanLemma(nw).toLowerCase() === cleanedF);
        }) || []
      : forms || [];

    // From tagged tokens
    sourceTaggedTokens?.forEach((t: any) => {
      mapping.set(t.token, cleanLemma(t.lemma));
    });
    // From generated forms
    sourceForms.forEach((f: any) => {
      mapping.set(f.form, cleanLemma(f.lemma));
    });

    const result = new Set<string>();
    mapping.forEach((lemma, form) => {
      let displayLemma = lemma;
      const ignoreDiacritics = localFilters.removeDiacritics;
      if (ignoreDiacritics) {
        const fl = applyFiltersToArray([lemma], { 
          ...localFilters, 
          removeDuplicates: false, 
          removeStopWords: false, 
          removeSpecialCharacters: false 
        });
        if (fl.length > 0) displayLemma = fl[0];
      }
      
      // When removeDuplicates is enabled, skip entries where form equals lemma
      // Apply same cleaning as applyFiltersToArray does (removeSpecialCharacters is implicit, removeDiacritics already applied to displayLemma if enabled)
      const cleanedForm = removeSpecialCharacters(form);
      const cleanedLemmaCompare = ignoreDiacritics 
        ? displayLemma  // already cleaned (special chars removed + toLowerCase via removeDiacritics)
        : removeSpecialCharacters(displayLemma);
      const formCompare = ignoreDiacritics 
        ? removeDiacritics(cleanedForm) 
        : cleanedForm.toLowerCase();
      const lemmaCompare = ignoreDiacritics 
        ? cleanedLemmaCompare  // already lowercased
        : cleanedLemmaCompare.toLowerCase();
      if (localFilters.removeDuplicates && formCompare === lemmaCompare) {
        return;
      }
      
      // Apply filters to form
      const filteredForm = applyFiltersToArray([form], localFilters);
      if (filteredForm.length > 0) {
        result.add(`${filteredForm[0]} = ${displayLemma}`);
      }
    });
    return Array.from(result).sort();
  }, [forms, taggedTokens, localFilters]);

  // Panel 2: Zpracovaná lemmata
  const filteredLemmas = useMemo(() => {
    const sourceTaggedTokens = taggedTokens;
    
    const sourceForms = forms || [];

    const allLemmas = Array.from(new Set([
      ...((sourceTaggedTokens as any[])?.map((t: any) => cleanLemma(t.lemma)) || []),
      ...((sourceForms as any[]).map((f: any) => cleanLemma(f.lemma)) || [])
    ])).filter(l => l && l.length > 0) as string[];
    
    return applyFiltersToArray(allLemmas, localFilters).sort();
  }, [forms, taggedTokens, localFilters, newWordsSet]);

  // Panel 3: Zpracované formy
  const filteredForms = useMemo(() => {
    const sourceTaggedTokens = localFilters.showOnlyNew 
      ? taggedTokens?.filter((t: any) => newWordsSet.has(t.token.toLowerCase()))
      : taggedTokens;
    
    const sourceForms = localFilters.showOnlyNew
      ? forms?.filter((f: any) => {
          const cleanedF = cleanLemma(f.lemma).toLowerCase();
          return Array.from(newWordsSet).some(nw => cleanLemma(nw).toLowerCase() === cleanedF);
        }) || []
      : forms || [];

    const allForms = Array.from(new Set([
      ...((sourceTaggedTokens as any[])?.map((t: any) => t.token as string) || []),
      ...((sourceForms as any[]).map((f: any) => f.form as string))
    ])).filter(f => f && f.length > 0) as string[];

    return applyFiltersToArray(allForms, localFilters).sort();
  }, [forms, taggedTokens, localFilters, newWordsSet]);

  const handleApplyFilters = () => {
    setFilters({
      ...localFilters,
      stopWordsList: stopWordsInput.split(/[,\s;]+/).map(s => s.trim()).filter(s => s.length > 0)
    });
  };

  const handleExport = (format: 'csv' | 'json' | 'txt') => {
    const timestamp = new Date().toISOString().slice(0, 10);
    const exportData = {
      formsToLemmas,
      filteredLemmas,
      filteredForms
    };
    
    if (format === 'json') {
      downloadFile(
        exportToJson(exportData),
        `wizard-results-${timestamp}.json`,
        'application/json'
      );
    } else if (format === 'csv') {
      const formsToLemmasCsv = exportStringArrayToCsv(formsToLemmas);
      const lemmasCsv = exportStringArrayToCsv(filteredLemmas);
      const formsCsv = exportStringArrayToCsv(filteredForms);
      
      const combinedCsv = [
        '# Forms to Lemmas',
        formsToLemmasCsv,
        '',
        '# Filtered Lemmas',
        lemmasCsv,
        '',
        '# Filtered Forms',
        formsCsv
      ].join('\n');
      
      downloadFile(
        combinedCsv,
        `wizard-results-${timestamp}.csv`,
        'text/csv'
      );
    } else {
      const combinedTxt = [
        '# Forms to Lemmas',
        ...formsToLemmas,
        '',
        '# Filtered Lemmas',
        ...filteredLemmas,
        '',
        '# Filtered Forms',
        ...filteredForms
      ].join('\n');
      
      downloadFile(
        combinedTxt,
        `wizard-results-${timestamp}.txt`,
        'text/plain'
      );
    }
  };

  const handleFinish = async () => {
    setIsSaving(true);
    try {
      await WorkflowService.saveWizardResults(
        taggedTokens,
        forms,
        model,
        keywordsText
      );
      if (confirm('Slova byla úspěšně uložena do databáze.\n\nChcete zpracovat další nová klíčová slova?')) {
        reset();
      } else {
        // Go to home or close
        setStep(1);
      }
    } catch (error) {
      alert(`Chyba při ukládání: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Souhrn a Export</h2>
          <p className="text-sm text-muted-foreground">Přehled a filtrace výsledků</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[300px]">
        <Card glass className="flex flex-col overflow-hidden">
          <CardHeader className="py-2">
            <CardTitle className="text-sm">Formy = Lemma ({formsToLemmas.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto text-xs font-mono">
            {formsToLemmas.map((item, i) => <div key={i}>{item}</div>)}
          </CardContent>
        </Card>
        <Card glass className="flex flex-col overflow-hidden">
          <CardHeader className="py-2">
            <CardTitle className="text-sm">Zpracovaná Lemmata ({filteredLemmas.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto text-xs">
            {filteredLemmas.join(', ')}
          </CardContent>
        </Card>
        <Card glass className="flex flex-col overflow-hidden">
          <CardHeader className="py-2">
            <CardTitle className="text-sm">Zpracované Formy ({filteredForms.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto text-xs">
            {filteredForms.join(', ')}
          </CardContent>
        </Card>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <h3 className="text-md font-semibold mb-4">Filtrace výsledků</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center space-x-2">
            <input 
              type="checkbox" 
              checked={localFilters.removeDuplicates}
              onChange={(e) => setLocalFilters({...localFilters, removeDuplicates: e.target.checked})}
              className="rounded text-primary focus:ring-primary"
            />
            <span className="text-sm">Odstranit duplicity</span>
          </label>
          <label className="flex items-center space-x-2">
            <input 
              type="checkbox" 
              checked={localFilters.removeDiacritics}
              onChange={(e) => setLocalFilters({...localFilters, removeDiacritics: e.target.checked})}
              className="rounded text-primary focus:ring-primary"
            />
            <span className="text-sm">Odstranit diakritiku</span>
          </label>
          <label className="flex items-center space-x-2">
            <input 
              type="checkbox" 
              checked={localFilters.removeSpecialCharacters}
              onChange={(e) => setLocalFilters({...localFilters, removeSpecialCharacters: e.target.checked})}
              className="rounded text-primary focus:ring-primary"
            />
            <span className="text-sm">Odstranit speciální znaky</span>
          </label>
          <label className="flex items-center space-x-2">
            <input 
              type="checkbox" 
              checked={localFilters.removeStopWords}
              onChange={(e) => setLocalFilters({...localFilters, removeStopWords: e.target.checked})}
              className="rounded text-primary focus:ring-primary"
            />
            <span className="text-sm">Odstranit Stop slova</span>
          </label>
          <label className="flex items-center space-x-2">
            <input 
              type="checkbox" 
              checked={localFilters.showOnlyNew}
              onChange={(e) => setLocalFilters({...localFilters, showOnlyNew: e.target.checked})}
              className="rounded text-primary focus:ring-primary"
            />
            <span className="text-sm">Jen nová slova</span>
          </label>
        </div>
        
        {localFilters.removeStopWords && (
          <div className="mt-4">
            <Input 
              label="Vlastní Stop Slova (oddělená čárkou)"
              value={stopWordsInput}
              onChange={(e) => setStopWordsInput(e.target.value)}
              placeholder="a, i, se, na..."
            />
          </div>
        )}
        
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" size="sm" onClick={handleApplyFilters}>
            Aplikovat filtry
          </Button>
        </div>
      </div>

      <div className="flex justify-between mt-4">
        <Button 
          variant="secondary" 
          onClick={() => setStep(3)}
        >
          {t('wizard.back')}
        </Button>
        
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => handleExport('csv')}>Export CSV</Button>
          <Button variant="ghost" onClick={() => handleExport('json')}>Export JSON</Button>
          <Button variant="ghost" onClick={() => handleExport('txt')}>Export TXT</Button>
          <Button 
            variant="primary" 
            onClick={handleFinish}
            disabled={isSaving}
          >
            {isSaving ? 'Ukládám...' : 'Dokončit a uložit'}
          </Button>
        </div>
      </div>
    </div>
  );
};
