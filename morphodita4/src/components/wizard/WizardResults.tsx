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
        <div className="flex flex-col items-center justify-center p-8 text-center motion-safe:animate-in motion-safe:fade-in">
         <p className="text-muted-foreground mb-4">{t('analyzer.no_result_placeholder')}</p>
         <Button onClick={() => setStep(1)}>{t('wizard.back')}</Button>
      </div>
    );
  }

  const { forms, uniqueLemmas, taggedTokens } = processingResult;

  const renderLemmasTable = () => (
    <div className="overflow-auto border border-border rounded-md mt-4 max-h-[min(60vh,32rem)]">
       <table aria-label={t('wizard.results.lemmasTable')} className="min-w-[34rem] w-full text-sm text-left">
         <caption className="sr-only">{t('wizard.results.lemmasTable')}</caption>
        <thead className="text-xs uppercase bg-secondary text-muted-foreground sticky top-0">
          <tr>
             <th scope="col" className="px-4 py-3">#</th>
             <th scope="col" className="px-4 py-3">{t('analyzer.results.form')}</th>
             <th scope="col" className="px-4 py-3">{t('analyzer.results.lemma')}</th>
             <th scope="col" className="px-4 py-3">{t('analyzer.results.tag')}</th>
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
    <div className="overflow-auto border border-border rounded-md mt-4 max-h-[min(60vh,32rem)]">
       <table aria-label={t('wizard.results.formsTable')} className="min-w-[30rem] w-full text-sm text-left">
         <caption className="sr-only">{t('wizard.results.formsTable')}</caption>
        <thead className="text-xs uppercase bg-secondary text-muted-foreground sticky top-0">
          <tr>
             <th scope="col" className="px-4 py-3">{t('analyzer.results.lemma')}</th>
             <th scope="col" className="px-4 py-3">{t('analyzer.results.form')}</th>
             <th scope="col" className="px-4 py-3">{t('analyzer.results.tag')}</th>
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
       label: t('wizard.results.lemmasTab', { count: uniqueLemmas }),
      content: renderLemmasTable()
    },
    {
      id: 'forms',
       label: t('wizard.results.formsTab', { count: forms?.length || 0 }),
      content: renderFormsTable()
    }
  ];

  return (
    <div className="flex flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-300">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
           <h2 className="text-xl font-semibold text-foreground">{t('analyzer.results.title')}</h2>
          <p className="text-sm text-muted-foreground">
             {activeTab === 'lemmas' ? t('wizard.results.lemmasPreview') : t('wizard.results.formsPreview')}
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
         <Tabs
           tabs={tabsData}
           ariaLabel={t('wizard.results.tabsLabel')}
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
