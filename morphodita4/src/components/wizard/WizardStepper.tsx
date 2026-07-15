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
    <div className="w-full py-6">
      <div className="flex items-center justify-between w-full relative">
        {/* Background track */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-secondary -z-10 rounded-full"></div>
        
        {/* Progress track */}
        <div 
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary -z-10 transition-all duration-300 rounded-full"
          style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
        ></div>

        {steps.map((step) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          
          return (
            <div key={step.id} className="flex flex-col items-center gap-2 relative">
              <div 
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-300 shadow-sm border-2",
                  isCompleted 
                    ? "bg-primary border-primary text-primary-foreground" 
                    : isCurrent 
                      ? "bg-background border-primary text-primary" 
                      : "bg-background border-secondary text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : step.id}
              </div>
              <span 
                className={cn(
                  "text-xs font-medium absolute -bottom-6 w-max text-center transition-colors duration-300",
                  isCurrent ? "text-primary font-bold" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
