import React from 'react';
import { useTranslation } from 'react-i18next';
import { WizardStepper, WizardInput, WizardProcessing, WizardResults, WizardSummary } from '../components/wizard';
import { useWizardStore } from '../store/useWizardStore';
import { Card } from '../components/common';

export const WizardPage: React.FC = () => {
  const { t } = useTranslation();
  const { currentStep } = useWizardStore();

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
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 container max-w-4xl py-6 sm:py-8 px-4 sm:px-8 flex flex-col gap-6 animate-in fade-in duration-300">
        
        <div className="flex flex-col space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">
            {t('home.wizard.title')}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {t('home.wizard.description')}
          </p>
        </div>

        <Card className="p-4 sm:p-6 md:p-8">
          <WizardStepper />
          <div className="mt-8">
            {renderStep()}
          </div>
        </Card>

      </main>
    </div>
  );
};
