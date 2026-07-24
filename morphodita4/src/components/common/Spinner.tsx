import React from 'react';
import { cn } from './utils';
import { Loader2 } from 'lucide-react';

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'primary' | 'secondary' | 'muted';
}

export const Spinner: React.FC<SpinnerProps> = ({ 
  size = 'md', 
  variant = 'primary', 
  className,
  ...props 
}) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };

  const variants = {
    primary: 'text-primary',
    secondary: 'text-secondary',
    muted: 'text-muted-foreground',
  };

  return (
    <div 
      className={cn("flex justify-center items-center", className)} 
      {...props}
    >
      <Loader2 
        className={cn(
          "animate-spin",
          sizes[size],
          variants[variant]
        )} 
      />
      <span className="sr-only">Loading...</span>
    </div>
  );
};
