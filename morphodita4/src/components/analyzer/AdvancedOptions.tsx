import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Select } from '../common/Select';
import { OperationType } from '../../types/common';

export interface AdvancedOptionsProps {
  operation: OperationType;
  guesser: boolean;
  onGuesserChange: (value: boolean) => void;
  inputFormat: 'untokenized' | 'vertical';
  onInputFormatChange: (value: 'untokenized' | 'vertical') => void;
  derivation: 'none' | 'root' | 'path' | 'tree';
  onDerivationChange: (value: 'none' | 'root' | 'path' | 'tree') => void;
  convertTagset: string;
  onConvertTagsetChange: (value: string) => void;
  disabled?: boolean;
}

export const AdvancedOptions: React.FC<AdvancedOptionsProps> = ({
  operation,
  guesser,
  onGuesserChange,
  inputFormat,
  onInputFormatChange,
  derivation,
  onDerivationChange,
  convertTagset,
  onConvertTagsetChange,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const panelId = `advanced-options-${useId()}`;
  const buttonId = `${panelId}-button`;
  const guesserId = `${panelId}-guesser`;
  const convertTagsetId = `${panelId}-convert-tagset`;

  const showGuesser = ['analyze', 'generate'].includes(operation);
  const showInputFormat = operation === 'analyze';
  const showDerivation = operation === 'analyze';
  const showConvertTagset = ['analyze', 'generate'].includes(operation);

  if (!showGuesser && !showInputFormat && !showDerivation && !showConvertTagset) {
    return null;
  }

  return (
    <div className="w-full mt-4 border border-border rounded-md overflow-hidden bg-card">
      <button
        id={buttonId}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="w-full flex items-center justify-between p-3 bg-secondary/50 hover:bg-secondary transition-colors"
      >
        <span className="text-sm font-medium text-foreground">
          {t('analyzer.advanced_options')}
        </span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {isOpen && (
        <div id={panelId} role="region" aria-labelledby={buttonId} className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 motion-safe:animate-in motion-safe:slide-in-from-top-2 motion-safe:duration-200">
          {showGuesser && (
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                id={guesserId}
                checked={guesser}
                onChange={(e) => onGuesserChange(e.target.checked)}
                disabled={disabled}
                className="rounded border-input text-primary focus:ring-primary"
              />
               <span className="text-sm text-foreground">{t('analyzer.guesser')}</span>
            </label>
          )}

          {showInputFormat && (
            <Select
              label={t('analyzer.input_format')}
              value={inputFormat}
              disabled={disabled}
               onValueChange={(value) => {
                 if (value === 'untokenized' || value === 'vertical') {
                   onInputFormatChange(value);
                }
              }}
              options={[
                { value: 'untokenized', label: t('analyzer.input_untokenized') },
                { value: 'vertical', label: t('analyzer.input_vertical') },
              ]}
            />
          )}

          {showDerivation && (
            <Select
              label={t('analyzer.derivation')}
              value={derivation}
              disabled={disabled}
               onValueChange={(value) => {
                 switch (value) {
                  case 'none':
                  case 'root':
                  case 'path':
                  case 'tree':
                     onDerivationChange(value);
                    break;
                }
              }}
              options={[
                { value: 'none', label: 'none' },
                { value: 'root', label: 'root' },
                { value: 'path', label: 'path' },
                { value: 'tree', label: 'tree' },
              ]}
            />
          )}

          {showConvertTagset && (
            <div className="flex flex-col gap-1.5">
               <label htmlFor={convertTagsetId} className="text-xs font-semibold text-muted-foreground leading-none">
                {t('analyzer.convert_tagset')}
              </label>
              <input
                type="text"
                id={convertTagsetId}
                value={convertTagset}
                onChange={(e) => onConvertTagsetChange(e.target.value)}
                disabled={disabled}
                placeholder="pdt_to_conll2009, ..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
