import React from 'react';
import { useWizardStore } from '../../store/useWizardStore';
import { cn } from '../common';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const WizardStepper: React.FC = () => {
  const { t } = useTranslation();
  const { currentStep } = useWizardStore();

  const steps = [
    { id: 1, label: t('wizard.steps.input') },
    { id: 2, label: t('wizard.steps.processing') },
    { id: 3, label: t('wizard.steps.results') },
    { id: 4, label: t('wizard.steps.summary') },
  ];

  return (
    <nav aria-label={t('home.wizard.title')} className="wizard-stepper">
      <ol>
        {steps.map((step) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          return <li key={step.id} aria-current={isCurrent ? 'step' : undefined}
            aria-label={isCompleted ? `${step.label}, ${t('common.success')}` : undefined}
            className={cn(isCurrent && 'is-current', isCompleted && 'is-completed')}>
            <span className="step-number" aria-hidden="true">{isCompleted ? <Check size={18} /> : step.id}</span>
            <span>{step.label}</span>
          </li>;
        })}
      </ol>
    </nav>
  );
};
