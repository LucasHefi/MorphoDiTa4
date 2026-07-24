import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWizardStore } from '../../store/useWizardStore';
import { Button, Tabs } from '../common';
import { MorphologicalTag } from '../../types/api';
import { cleanLemma } from '../../services/filters';

export const WizardResults: React.FC = () => {
  const { t } = useTranslation();
  const { processingResult, setStep } = useWizardStore();

  const [activeTab, setActiveTab] = useState('lemmas');

  if (!processingResult) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
        <p className="text-muted-foreground mb-4">Nejsou k dispozici žádné výsledky.</p>
        <Button onClick={() => setStep(1)}>Zpět na zadání</Button>
      </div>
    );
  }

  const { forms, uniqueLemmas, taggedTokens } = processingResult;

  const renderLemmasTable = () => (
    <div className="overflow-x-auto border border-border rounded-md mt-4 max-h-[400px] overflow-y-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs uppercase bg-secondary text-muted-foreground sticky top-0">
          <tr>
            <th className="px-4 py-3">#</th>
            <th className="px-4 py-3">Forma</th>
            <th className="px-4 py-3">Lemma</th>
            <th className="px-4 py-3">Tag</th>
          </tr>
        </thead>
        <tbody>
          {taggedTokens?.map((token, idx) => (
            <tr key={idx} className="bg-background border-b border-border hover:bg-secondary/50">
              <td className="px-4 py-2 font-mono text-muted-foreground w-12">{idx + 1}</td>
              <td className="px-4 py-2 font-medium">{token.token}</td>
              <td className="px-4 py-2">{cleanLemma(token.lemma)}</td>
              <td className="px-4 py-2 font-mono text-xs">{token.tag}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderFormsTable = () => (
    <div className="overflow-x-auto border border-border rounded-md mt-4 max-h-[400px] overflow-y-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs uppercase bg-secondary text-muted-foreground sticky top-0">
          <tr>
            <th className="px-4 py-3">Lemma</th>
            <th className="px-4 py-3">Forma</th>
            <th className="px-4 py-3">Tag</th>
          </tr>
        </thead>
        <tbody>
          {forms?.map((item: MorphologicalTag, idx: number) => (
            <tr key={idx} className="bg-background border-b border-border hover:bg-secondary/50">
              <td className="px-4 py-2 text-muted-foreground">{cleanLemma(item.lemma)}</td>
              <td className="px-4 py-2 font-medium">{item.form || item.lemma}</td>
              <td className="px-4 py-2 font-mono text-xs">{item.tag}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const tabsData = [
    {
      id: 'lemmas',
      label: `Nalezená Lemmata (${uniqueLemmas})`,
      content: renderLemmasTable()
    },
    {
      id: 'forms',
      label: `Vygenerované Formy (${forms?.length || 0})`,
      content: renderFormsTable()
    }
  ];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Výsledky</h2>
          <p className="text-sm text-muted-foreground">
            {activeTab === 'lemmas' ? 'Náhled nalezených lemmat' : 'Náhled vygenerovaných forem'}
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <Tabs 
          tabs={tabsData} 
          defaultTabId="lemmas" 
          onTabChange={setActiveTab}
        />
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <Button 
          variant="secondary" 
          onClick={() => setStep(2)}
        >
          {t('wizard.back')}
        </Button>
        <Button 
          onClick={() => setStep(4)} 
          className="min-w-[120px]"
        >
          {t('wizard.next')}
        </Button>
      </div>
    </div>
  );
};
