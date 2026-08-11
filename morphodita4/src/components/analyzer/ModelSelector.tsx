import React, { useEffect, useRef } from 'react';
import { useApiStore } from '../../store/useApiStore';
import { Select } from '../common/Select';
import { SelectOption } from '../../types/common';
import { Button } from '../common/Button';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export const ModelSelector: React.FC<{ compact?: boolean; disabled?: boolean }> = ({ compact = false, disabled = false }) => {
  const { t } = useTranslation();
  const { models, selectedModel, isLoading, error, setSelectedModel, refreshModels } = useApiStore();
  const automaticRequestStarted = useRef(false);

  useEffect(() => {
    if (!automaticRequestStarted.current && Object.keys(models).length === 0) {
      automaticRequestStarted.current = true;
      void refreshModels();
    }
  }, [models, refreshModels]);

  const options: SelectOption[] = Object.entries(models).map(([key, info]) => ({
    value: key,
    label: `${info.language} - ${info.description}`
  }));

  return (
    <div className="flex items-end gap-2 w-full max-w-md">
      <div className="flex-1">
        <Select
          label={compact ? undefined : t('analyzer.model_select')}
          aria-label={compact ? t('analyzer.model_select') : undefined}
          options={options}
          value={selectedModel || ''}
           onValueChange={setSelectedModel}
          disabled={isLoading || disabled}
          error={error ? `${t('common.error')}: ${error}` : undefined}
        />
      </div>
      {isLoading && <span role="status" className="sr-only">{t('common.loading')}</span>}
      {error && (
        <Link to="/settings" className="mb-2 text-sm text-primary underline underline-offset-4">
          {t('settings.modelDownloadTitle')}
        </Link>
      )}
      <Button
        variant="ghost"
        size="md"
        onClick={() => void refreshModels()}
        disabled={isLoading || disabled}
        aria-label={t('database.refresh')}
        title={t('database.refresh')}
        className="mb-[2px]"
      >
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isLoading ? 'motion-safe:animate-spin' : ''}`} />
      </Button>
    </div>
  );
};
