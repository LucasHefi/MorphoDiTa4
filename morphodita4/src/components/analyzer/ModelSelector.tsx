import React, { useEffect } from 'react';
import { useApiStore } from '../../store/useApiStore';
import { MorphoDiTaAPI } from '../../services/api';
import { Select } from '../common/Select';
import { SelectOption } from '../../types/common';
import { Button } from '../common/Button';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const ModelSelector: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { t } = useTranslation();
  const { models, selectedModel, isLoading, error, setModels, setSelectedModel, setIsLoading, setError } = useApiStore();

  const fetchModels = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await MorphoDiTaAPI.getModels();
      setModels(response.models);
      
      // Auto-select Czech model if available, else select the first one
      const modelKeys = Object.keys(response.models);
      if (modelKeys.length > 0 && !selectedModel) {
        const czechModel = modelKeys.find(key => key.includes('czech'));
        setSelectedModel(czechModel || modelKeys[0]);
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
      setError(t('common.error') + ': ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (Object.keys(models).length === 0) {
      fetchModels();
    }
  }, []);

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
          error={error || undefined}
        />
      </div>
      <Button 
        variant="ghost" 
        size="md" 
        onClick={fetchModels} 
        disabled={isLoading}
        title="Refresh models"
        className="mb-[2px]"
      >
        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  );
};
