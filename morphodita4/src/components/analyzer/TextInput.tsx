import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextArea } from '../common/TextArea';
import { Button } from '../common/Button';
import { Upload, X } from 'lucide-react';

export interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const TextInput: React.FC<TextInputProps> = ({ value, onChange, disabled }) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const lineCount = value ? value.split('\n').length : 0;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size (max 5MB for frontend parsing)
    if (file.size > 5 * 1024 * 1024) {
      setError('File is too large (max 5MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      onChange(text);
      setError(null);
    };
    reader.onerror = () => {
      setError('Error reading file.');
    };
    reader.readAsText(file);

    // Reset input so the same file can be loaded again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClear = () => {
    onChange('');
    setError(null);
  };

  return (
    <div className="flex flex-col gap-2 w-full mt-4">
      <div className="flex justify-between items-end">
        <label className="text-sm font-medium text-foreground">
          {t('analyzer.input_placeholder').replace('...', '')}
        </label>
        <div className="flex gap-2">
          {value && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleClear} 
              disabled={disabled}
              className="h-7 text-xs text-muted-foreground"
            >
              <X className="w-3 h-3 mr-1" />
              Clear
            </Button>
          )}
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={() => fileInputRef.current?.click()} 
            disabled={disabled}
            className="h-7 text-xs"
          >
            <Upload className="w-3 h-3 mr-1" />
            Import TXT
          </Button>
          <input 
            type="file" 
            accept=".txt" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
          />
        </div>
      </div>
      
      <TextArea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('analyzer.input_placeholder')}
        disabled={disabled}
        error={error || undefined}
        className="min-h-[150px] resize-y font-mono"
      />
      
      <div className="flex justify-end text-xs text-muted-foreground gap-4">
        <span>Slov: {wordCount}</span>
        <span>Řádků: {lineCount}</span>
      </div>
    </div>
  );
};
