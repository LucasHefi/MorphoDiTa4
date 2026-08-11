import { ReactNode, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FloatingMenu, FloatingMenuItem } from './FloatingMenu';
import { cn } from './utils';

export interface DropdownMenuProps {
  label: string;
  items: FloatingMenuItem[];
  onSelect: (value: string) => void;
  disabled?: boolean;
  trigger?: ReactNode;
  className?: string;
}

export function DropdownMenu({ label, items, onSelect, disabled, trigger, className }: DropdownMenuProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  const openMenu = (direction: 1 | -1 = 1) => {
    if (disabled) return;
    const enabled = items.flatMap((item, index) => item.disabled ? [] : [index]);
    setActiveIndex(direction === -1 ? (enabled.at(-1) ?? -1) : (enabled[0] ?? -1));
    setOpen(true);
  };
  const toggle = () => { if (!disabled) (open ? close : openMenu)(); };
  return (
    <div className={cn('relative inline-block', className)}>
       <button id={`${id}-trigger`} ref={triggerRef} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={label} disabled={disabled} onClick={toggle} onKeyDown={(event) => { if (!open && event.key === 'ArrowDown') { event.preventDefault(); openMenu(1); } else if (!open && event.key === 'ArrowUp') { event.preventDefault(); openMenu(-1); } else if (!open && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openMenu(1); } }} className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
        {trigger ?? <>{label}<ChevronDown aria-hidden="true" className="h-3.5 w-3.5" /></>}
      </button>
      <FloatingMenu id={id} open={open} onClose={close} triggerRef={triggerRef} items={items} onSelect={(value) => { onSelect(value); close(); }} activeIndex={activeIndex} onActiveIndexChange={setActiveIndex} role="menu" labelledBy={`${id}-trigger`} />
    </div>
  );
}
