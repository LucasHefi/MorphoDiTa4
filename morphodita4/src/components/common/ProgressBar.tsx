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
        return 'bg-primary bg-[length:1rem_1rem] [background-image:linear-gradient(45deg,hsl(var(--status-info)_/_0.3)_25%,transparent_25%,transparent_50%,hsl(var(--status-info)_/_0.3)_50%,hsl(var(--status-info)_/_0.3)_75%,transparent_75%,transparent)] motion-safe:animate-[progress-stripes_1s_linear_infinite]';
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
      <div
        aria-label={label ?? 'Progress'}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(safeProgress)}
        className="h-2 w-full bg-secondary rounded-full overflow-hidden"
        role="progressbar"
      >
        <div 
          className={cn("h-full motion-safe:transition-[width] duration-300 ease-in-out", getVariantClasses())}
          style={{ width: `${safeProgress}%` }}
        />
      </div>
    </div>
  );
};
