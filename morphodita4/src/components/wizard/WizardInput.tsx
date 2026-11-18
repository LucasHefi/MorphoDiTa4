import React from 'react';
import { useTranslation } from 'react-i18next';
import { useWizardStore } from '../../store/useWizardStore';
import { TextArea, Button } from '../common';
import { ResultPager } from './ResultPagination';
import { getWizardEditorPage, replaceWizardEditorPage, WIZARD_EDITOR_PAGE_CHARS } from '../../services/wizardEditor';
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
  const { keywordsText, setKeywordsText, setStep, resultsInvalidated } = useWizardStore();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [inputError, setInputError] = React.useState<WizardInputError | null>(null);

  const [inputPage, setInputPage] = React.useState(0);
  const editor = getWizardEditorPage(keywordsText, inputPage);
  const wordCount = React.useMemo(() => getWizardInputWordCount(keywordsText), [keywordsText]);

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
      setInputPage(0);
      setInputError(null);
    };
    reader.onerror = () => setInputError({ code: 'file-read-failed' });
    reader.readAsText(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const commitText = (nextText: string) => {
    const textError = getWizardInputError(nextText);
    setInputError(textError);
    if (!textError) setKeywordsText(nextText);
  };

  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    commitText(replaceWizardEditorPage(keywordsText, editor.page, event.target.value));
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.getData('text/plain');
    if (pasted.length <= WIZARD_EDITOR_PAGE_CHARS) return;
    event.preventDefault();
    const field = event.currentTarget;
    const value = field.value.slice(0, field.selectionStart) + pasted + field.value.slice(field.selectionEnd);
    commitText(replaceWizardEditorPage(keywordsText, editor.page, value));
  };

  const handleNext = () => {
    const textError = getWizardInputError(keywordsText);
    if (inputError || textError) {
      setInputError(inputError ?? textError);
      return;
    }
    if (wordCount > 0) {
      setStep(2);
    }
  };

  const errorMessage = inputError
    ? inputError.code === 'too-many-words'
      ? t('wizard.input_too_many_words', { maxWords: inputError.maxWords })
      : inputError.code === 'input-too-large'
        ? t('wizard.input_too_large', { maxMB: inputError.maxBytes / 1_000_000 })
      : inputError.code === 'file-too-large'
        ? t('wizard.input_file_too_large', { maxMB: inputError.maxBytes / 1_000_000 })
        : t('wizard.input_file_read_failed')
    : undefined;

  return (
    <div className="wizard-input-layout flex flex-col gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-300">
      {resultsInvalidated && <p role="status" className="rounded-md border border-border bg-secondary p-3 text-sm">{t('wizard.model_changed_rerun')}</p>}
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

          <div className="relative wizard-input-editor">
            <TextArea
              label={t('wizard.input_label')}
              value={editor.value}
              onChange={handleTextChange}
              onPaste={handlePaste}
              placeholder={t('wizard.input_placeholder')}
              className="min-h-[clamp(12rem,35vh,24rem)] max-h-[60vh] font-mono text-sm resize-y"
              maxLength={MAX_WIZARD_INPUT_BYTES}
              error={errorMessage}
            />
            <div className="absolute bottom-2 right-3 text-xs text-muted-foreground">
              {t('wizard.wordCount', { count: wordCount })}
            </div>
          </div>

      {editor.pages > 1 && <div className="rounded border border-border p-3">
        <p className="text-sm text-muted-foreground">{t('wizard.editor_page_hint', { page: editor.page + 1, pages: editor.pages })}</p>
        <ResultPager page={editor.page} pages={editor.pages} setPage={setInputPage} />
      </div>}
      {keywordsText.length > 0 && <Button variant="ghost" onClick={() => { setKeywordsText(''); setInputPage(0); setInputError(null); }}>{t('wizard.clear_input')}</Button>}

      <p className="help-strip">{t('wizard.input_digits_removed')}</p>
      <p className="text-xs text-muted-foreground">{t('design.limits')}</p>
      <div className="wizard-actions flex justify-end mt-4">
        <Button
          onClick={handleNext}
          disabled={wordCount === 0 || inputError !== null}
          className="w-full sm:w-auto min-w-[120px]"
        >
          {t('design.continueProcessing')}
        </Button>
      </div>
      <aside className="wizard-guide"><h3>{t('design.howTo')}</h3><ol><li>{t('design.guideInput')}</li><li>{t('design.guideResults')}</li><li>{t('design.guideSave')}</li></ol></aside>
    </div>
  );
};
