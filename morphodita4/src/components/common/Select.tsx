import { ButtonHTMLAttributes, forwardRef, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FloatingMenu } from './FloatingMenu';
import { cn } from './utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'defaultValue' | 'onChange'> {
  label?: string;
  options: SelectOption[];
  error?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  ({ className, label, options, error, value, defaultValue, onValueChange, name, id, disabled, children, onClick, onKeyDown, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id ?? `select-${generatedId}`;
    const errorId = `${selectId}-error`;
    const describedBy = [props['aria-describedby'], error ? errorId : undefined].filter(Boolean).join(' ') || undefined;
    const listboxId = `${selectId}-listbox`;
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [internalValue, setInternalValue] = useState(defaultValue ?? options.find((option) => !option.disabled)?.value ?? '');
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(Math.max(0, options.findIndex((option) => option.value === (value ?? internalValue))));
    const selectedValue = value ?? internalValue;
    const selected = options.find((option) => option.value === selectedValue);
    const close = () => { setOpen(false); triggerRef.current?.focus(); };
    const selectValue = (nextValue: string) => {
      if (value === undefined) setInternalValue(nextValue);
      onValueChange?.(nextValue);
      close();
    };
    const openMenu = () => {
      if (disabled) return;
      const selectedIndex = options.findIndex((option) => option.value === selectedValue && !option.disabled);
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : Math.max(0, options.findIndex((option) => !option.disabled)));
      setOpen(true);
    };
    return (
      <div className="w-full space-y-1">
        {label && <label htmlFor={selectId} className="text-sm font-medium text-foreground">{label}</label>}
        <div className="relative">
           <button
             ref={(node) => { triggerRef.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }}
             {...props}
             type="button"
            id={selectId}
             aria-haspopup="listbox"
             aria-expanded={open}
             aria-controls={open ? listboxId : undefined}
            aria-describedby={describedBy}
            aria-invalid={error ? true : props['aria-invalid']}
            disabled={disabled}
             onClick={(event) => {
               onClick?.(event);
               if (!event.defaultPrevented) (open ? close : openMenu)();
             }}
             onKeyDown={(event) => {
               onKeyDown?.(event);
               if (!event.defaultPrevented && (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openMenu(); }
             }}
            className={cn('flex h-10 w-full items-center justify-between rounded-md border border-dropdown bg-popover px-3 py-2 pr-10 text-sm text-popover-foreground shadow-dropdown focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50', error && 'border-destructive focus-visible:ring-destructive', className)}
           >
            <span>{selected?.label ?? children ?? ''}</span>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </button>
          {name && <input type="hidden" name={name} value={selectedValue} />}
        </div>
        {error && <p id={errorId} role="alert" className="text-xs text-destructive">{error}</p>}
         <FloatingMenu id={listboxId} open={open} onClose={close} triggerRef={triggerRef} items={options} onSelect={selectValue} activeIndex={activeIndex} onActiveIndexChange={setActiveIndex} role="listbox" labelledBy={selectId} selectedValue={selectedValue} />
      </div>
    );
  },
);

Select.displayName = 'Select';
