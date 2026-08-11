import React from 'react';
import { cn } from './utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
}

export const Badge: React.FC<BadgeProps> = ({ 
  children, 
  variant = 'neutral', 
  className,
  ...props 
}) => {
  const variants = {
    success: 'status-success',
    warning: 'status-warning',
    error: 'status-error',
    info: 'status-info',
    neutral: 'bg-secondary text-secondary-foreground border-border',
  };

  return (
    <div 
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        variants[variant],
        className
      )}
      data-status={variant}
      {...props}
    >
      {children}
    </div>
  );
};
