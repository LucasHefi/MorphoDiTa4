import React from 'react';
import { Tags, ScanText, WandSparkles, Blocks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { OperationType } from '../../types/common';

export interface OperationSelectorProps {
  selectedOperation: OperationType;
  onOperationChange: (operation: OperationType) => void;
  disabled?: boolean;
}

export const OperationSelector: React.FC<OperationSelectorProps> = ({
  selectedOperation,
  onOperationChange,
  disabled = false,
}) => {
  const { t } = useTranslation();

  const icons = { tag: Tags, analyze: ScanText, generate: WandSparkles, tokenize: Blocks };

  const operations: { id: OperationType; label: string }[] = [
    { id: 'tag', label: t('analyzer.operations.tag') },
    { id: 'analyze', label: t('analyzer.operations.analyze') },
    { id: 'generate', label: t('analyzer.operations.generate') },
    { id: 'tokenize', label: t('analyzer.operations.tokenize') },
  ];

  return (
    <div className="operation-switch flex flex-wrap gap-2 mt-4 mb-4">
      {operations.map((op) => { const Icon = icons[op.id]; return (
        <label
          key={op.id}
          title={t(`design.operationHelp.${op.id}`)}
          className={`operation-option ${selectedOperation === op.id ? 'is-selected' : ''}`}
        >
          <div className="relative flex items-center justify-center">
            <input
              type="radio"
              name="operation"
              value={op.id}
              checked={selectedOperation === op.id}
              onChange={(e) => onOperationChange(e.target.value as OperationType)}
              disabled={disabled}
              className="peer sr-only"
            />
            <div className="w-5 h-5 rounded-full border-2 border-muted-foreground peer-checked:border-primary peer-checked:bg-primary transition-all duration-200"></div>
            <div className="absolute w-2 h-2 rounded-full bg-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200"></div>
          </div>
          <Icon size={19} aria-hidden="true" />
          <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors duration-200">
            {op.label}
          </span>
        </label>
      ); })}
    </div>
  );
};
