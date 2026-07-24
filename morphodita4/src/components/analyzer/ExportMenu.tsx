import React from 'react';
import { Button } from '../common/Button';
import { Download } from 'lucide-react';

export interface ExportMenuProps {
  onExport: (format: 'csv' | 'json' | 'txt') => void;
  disabled?: boolean;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({ onExport, disabled }) => {
  return (
    <div className="flex gap-2">
      <Button 
        variant="secondary" 
        size="sm" 
        onClick={() => onExport('csv')}
        disabled={disabled}
      >
        <Download className="w-4 h-4 mr-2" />
        CSV
      </Button>
      <Button 
        variant="secondary" 
        size="sm" 
        onClick={() => onExport('json')}
        disabled={disabled}
      >
        <Download className="w-4 h-4 mr-2" />
        JSON
      </Button>
      <Button 
        variant="secondary" 
        size="sm" 
        onClick={() => onExport('txt')}
        disabled={disabled}
      >
        <Download className="w-4 h-4 mr-2" />
        TXT
      </Button>
    </div>
  );
};
