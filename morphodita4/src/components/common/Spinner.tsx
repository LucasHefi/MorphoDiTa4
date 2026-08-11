import React from 'react';
import i18n from 'i18next';
import { cn } from './utils';
import { Loader2 } from 'lucide-react';
import cs from '../../locales/cs.json';
import en from '../../locales/en.json';
import pl from '../../locales/pl.json';

const spinnerTranslations = { cs, en, pl } as const;

function useSpinnerLanguage(): keyof typeof spinnerTranslations {
  return React.useSyncExternalStore(
    (onChange) => {
      i18n.on('languageChanged', onChange);
      return () => i18n.off('languageChanged', onChange);
    },
    () => normalizeLanguage(i18n.resolvedLanguage ?? i18n.language),
    () => 'en',
  );
}

function normalizeLanguage(language: string | undefined): keyof typeof spinnerTranslations {
  const baseLanguage = language?.split('-')[0];
  return baseLanguage === 'cs' || baseLanguage === 'pl' ? baseLanguage : 'en';
}

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'primary' | 'secondary' | 'muted';
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  variant = 'primary',
  className,
  'aria-label': ariaLabel,
  ...props
}) => {
  const language = useSpinnerLanguage();
  const translation = spinnerTranslations[language].common;
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };

  const variants = {
    primary: 'text-primary',
    secondary: 'text-secondary',
    muted: 'text-muted-foreground',
  };

  return (
    <div
       aria-label={ariaLabel ?? translation.loadingLabel}
      role="status"
      className={cn("flex justify-center items-center", className)}
      {...props}
    >
      <Loader2
        className={cn(
          "motion-safe:animate-spin",
          sizes[size],
          variants[variant]
        )}
      />
      <span className="sr-only">{translation.loading}</span>
    </div>
  );
};
