import React from 'react';
import { cn } from './utils';

export interface ProgressBarProps {
  progress: number; // 0 to 100
  label?: string;
  variant?: 'solid' | 'gradient' | 'striped';
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ 
  progress, 
  label, 
  variant = 'solid', 
  className 
}) => {
  const safeProgress = Math.min(Math.max(progress, 0), 100);

  const getVariantClasses = () => {
    switch (variant) {
      case 'gradient':
        return 'bg-gradient-to-r from-primary to-accent';
      case 'striped':
        return 'bg-primary bg-[length:1rem_1rem] [background-image:linear-gradient(45deg,rgba(255,255,255,.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,.15)_50%,rgba(255,255,255,.15)_75%,transparent_75%,transparent)] animate-[progress-stripes_1s_linear_infinite]';
      case 'solid':
      default:
        return 'bg-primary';
    }
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="flex justify-between items-center mb-1">
        {label && <span className="text-sm font-medium text-foreground">{label}</span>}
        <span className="text-sm font-medium text-foreground">{Math.round(safeProgress)}%</span>
      </div>
      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
        <div 
          className={cn("h-full transition-all duration-300 ease-in-out", getVariantClasses())}
          style={{ width: `${safeProgress}%` }}
        />
      </div>
    </div>
  );
};
