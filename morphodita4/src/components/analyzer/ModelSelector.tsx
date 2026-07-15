import React, { useEffect, useRef } from 'react';
import { useApiStore } from '../../store/useApiStore';
import { Select } from '../common/Select';
import { SelectOption } from '../../types/common';
import { Button } from '../common/Button';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const ModelSelector: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
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
          options={options}
          value={selectedModel || ''}
          onChange={(e) => setSelectedModel(e.target.value)}
          disabled={isLoading}
          error={error ? `${t('common.error')}: ${error}` : undefined}
        />
      </div>
      <Button 
        variant="ghost" 
        size="md" 
        onClick={() => void refreshModels()}
        disabled={isLoading}
        title="Refresh models"
        className="mb-[2px]"
      >
        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  );
};
