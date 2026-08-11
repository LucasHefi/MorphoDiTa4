import React from 'react';
import { useTranslation } from 'react-i18next';
import { useWizardStore } from '../../store/useWizardStore';
import { TextArea, Button } from '../common';
import { Upload } from 'lucide-react';
import {
  getWizardInputError,
  getWizardInputFileError,
  getWizardInputWordCount,
  MAX_WIZARD_INPUT_BYTES,
  type WizardInputError,
} from '../../services/wizardInput';

export const WizardInput: React.FC = () => {
  const { t } = useTranslation();
  const { keywordsText, setKeywordsText, setStep } = useWizardStore();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [inputError, setInputError] = React.useState<WizardInputError | null>(null);

  const wordCount = getWizardInputWordCount(keywordsText);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileError = getWizardInputFileError(file.size);
    if (fileError) {
      setInputError(fileError);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = typeof event.target?.result === 'string' ? event.target.result : '';
      const textError = getWizardInputError(text);
      if (textError) {
        setInputError(textError);
        return;
      }
      setKeywordsText(text);
      setInputError(null);
    };
    reader.onerror = () => setInputError({ code: 'file-read-failed' });
    reader.readAsText(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextText = event.target.value;
    const textError = getWizardInputError(nextText);
    setInputError(textError);
    if (!textError) setKeywordsText(nextText);
  };

  const handleNext = () => {
    const textError = getWizardInputError(keywordsText);
    if (inputError || textError) {
      setInputError(inputError ?? textError);
      return;
    }
    if (keywordsText.trim()) {
      setStep(2);
    }
  };

  const errorMessage = inputError
    ? inputError.code === 'too-many-words'
      ? t('wizard.input_too_many_words', { maxWords: inputError.maxWords })
      : inputError.code === 'input-too-large'
        ? t('wizard.input_too_large', { maxMiB: inputError.maxBytes / (1024 * 1024) })
      : inputError.code === 'file-too-large'
        ? t('wizard.input_file_too_large', { maxMiB: inputError.maxBytes / (1024 * 1024) })
        : t('wizard.input_file_read_failed')
    : undefined;

  return (
    <div className="flex flex-col gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-300">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-xl font-semibold text-foreground">{t('wizard.input_title')}</h2>
        <Button 
          variant="secondary" 
          size="sm" 
          onClick={() => fileInputRef.current?.click()}
        >
           <Upload aria-hidden="true" className="w-4 h-4 mr-2" />
          {t('wizard.import_txt')}
        </Button>
        <input 
          type="file" 
          accept=".txt" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {t('wizard.input_description')}
      </p>

          <div className="relative">
            <TextArea
              label={t('wizard.input_label')}
              value={keywordsText}
              onChange={handleTextChange}
              placeholder={t('wizard.input_placeholder')}
              className="min-h-[clamp(12rem,35vh,24rem)] max-h-[60vh] font-mono text-sm resize-y"
              maxLength={MAX_WIZARD_INPUT_BYTES}
              error={errorMessage}
            />
            <div className="absolute bottom-2 right-3 text-xs text-muted-foreground">
              {t('wizard.wordCount', { count: wordCount })}
            </div>
          </div>

      <div className="flex justify-end mt-4">
        <Button 
          onClick={handleNext} 
          disabled={!keywordsText.trim()}
          className="w-full sm:w-auto min-w-[120px]"
        >
          {t('wizard.next')}
        </Button>
      </div>
    </div>
  );
};
