import React from 'react';
import { useTranslation } from 'react-i18next';
import { useWizardStore } from '../../store/useWizardStore';
import { TextArea, Button } from '../common';
import { Upload } from 'lucide-react';

export const WizardInput: React.FC = () => {
  const { t } = useTranslation();
  const { keywordsText, setKeywordsText, setStep } = useWizardStore();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const wordCount = keywordsText.trim() ? keywordsText.trim().split(/\s+/).length : 0;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setKeywordsText(text);
    };
    reader.readAsText(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleNext = () => {
    if (keywordsText.trim()) {
      setStep(2);
    }
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-foreground">{t('wizard.input_title')}</h2>
        <Button 
          variant="secondary" 
          size="sm" 
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-4 h-4 mr-2" />
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
              onChange={(e) => setKeywordsText(e.target.value)}
              placeholder={t('wizard.input_placeholder')}
              className="h-[300px] font-mono text-sm resize-none"
            />
            <div className="absolute bottom-2 right-3 text-xs text-muted-foreground">
              Slov: {wordCount}
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
