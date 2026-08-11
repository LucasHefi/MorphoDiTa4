import React from 'react';
import { useTranslation } from 'react-i18next';
import { DropdownMenu } from '../common';
import { Download } from 'lucide-react';

export interface ExportMenuProps {
  onExport: (format: 'csv' | 'json' | 'txt') => void;
  disabled?: boolean;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({ onExport, disabled }) => {
  const { t } = useTranslation();
  return (
    <DropdownMenu
      label={t('analyzer.export.label')}
      disabled={disabled}
      trigger={<><Download aria-hidden="true" className="h-4 w-4" /><span>{t('analyzer.export.label')}</span></>}
      items={[{ value: 'csv', label: 'CSV' }, { value: 'json', label: 'JSON' }, { value: 'txt', label: 'TXT' }]}
      onSelect={(value) => onExport(value as 'csv' | 'json' | 'txt')}
    />
  );
};
