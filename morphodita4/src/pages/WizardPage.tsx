import React from 'react';
import { useTranslation } from 'react-i18next';
import { WizardStepper, WizardInput, WizardProcessing, WizardResults, WizardSummary } from '../components/wizard';
import { useWizardStore } from '../store/useWizardStore';
import { ModelSelector } from '../components/analyzer/ModelSelector';
import { Card } from '../components/common';

export const WizardPage: React.FC = () => {
  const { t } = useTranslation();
  const { currentStep, run } = useWizardStore();

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <WizardInput />;
      case 2:
        return <WizardProcessing />;
      case 3:
        return <WizardResults />;
      case 4:
        return <WizardSummary />;
      default:
        return <WizardInput />;
    }
  };

  return (
    <div className="flex flex-col">
      <main className="wizard-page flex-1 container max-w-4xl mx-auto py-6 sm:py-8 px-4 sm:px-8 flex flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300" data-step={currentStep}>

        <div className="flex flex-col space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">
            {t('home.wizard.title')}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {t('home.wizard.description')}
          </p>
        </div>

        <ModelSelector disabled={run.status === 'processing'} />
        <Card className="wizard-surface p-4 sm:p-6 md:p-8">
          <WizardStepper />
          <div className="wizard-step-content mt-8">
            {renderStep()}
          </div>
        </Card>

      </main>
    </div>
  );
};
