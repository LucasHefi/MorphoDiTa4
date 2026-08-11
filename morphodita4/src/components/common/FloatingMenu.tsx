import {
  ReactNode,
  RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useId,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from './utils';

export interface FloatingMenuItem {
  value: string;
  label: string;
  disabled?: boolean;
}

interface FloatingMenuProps {
  open: boolean;
  onClose: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
  items: FloatingMenuItem[];
  onSelect: (value: string) => void;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  role: 'menu' | 'listbox';
  anchor?: { x: number; y: number };
  className?: string;
  labelledBy?: string;
  ariaLabel?: string;
  selectedValue?: string;
  id?: string;
  children?: ReactNode;
}

export function FloatingMenu({
  open,
  onClose,
  triggerRef,
  items,
  onSelect,
  activeIndex,
  onActiveIndexChange,
  role,
  anchor,
  className,
  labelledBy,
  ariaLabel,
  selectedValue,
  id,
}: FloatingMenuProps) {
  const generatedId = useId();
  const menuId = id ?? `floating-menu-${generatedId}`;
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const typeahead = useRef('');
  const typeaheadTimer = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const reposition = () => {
      const menu = menuRef.current;
      if (!menu) return;
      const rect = triggerRef?.current?.getBoundingClientRect();
      const width = menu.offsetWidth || 220;
      const height = menu.offsetHeight || Math.min(items.length * 36 + 8, 320);
      const x = anchor?.x ?? rect?.left ?? 0;
      const y = anchor?.y ?? (rect ? rect.bottom : 0);
      const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
      const top = anchor
        ? Math.max(8, Math.min(y, window.innerHeight - height - 8))
        : y + height <= window.innerHeight - 8
          ? y
          : Math.max(8, (rect?.top ?? height) - height);
      setPosition({ left, top });
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [anchor, items.length, open, triggerRef]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.focus();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef?.current?.contains(target)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open, triggerRef]);

  useEffect(() => () => window.clearTimeout(typeaheadTimer.current), []);

  if (!open) return null;

  const enabledIndexes = items.flatMap((item, index) => item.disabled ? [] : [index]);
  const activeItem = items[activeIndex];
  const activeDescendant = activeItem && !activeItem.disabled ? `${menuId}-option-${activeItem.value}` : undefined;
  const move = (direction: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    const current = enabledIndexes.indexOf(activeIndex);
    const next = current < 0 ? 0 : (current + direction + enabledIndexes.length) % enabledIndexes.length;
    onActiveIndexChange(enabledIndexes[next]);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); return; }
    if (event.key === 'Home') { event.preventDefault(); onActiveIndexChange(enabledIndexes[0] ?? -1); return; }
    if (event.key === 'End') { event.preventDefault(); onActiveIndexChange(enabledIndexes.at(-1) ?? -1); return; }
    if (event.key === 'Enter' || (role === 'listbox' && event.key === ' ')) {
      event.preventDefault();
      const item = items[activeIndex];
      if (item && !item.disabled) onSelect(item.value);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      typeahead.current += event.key.toLowerCase();
      window.clearTimeout(typeaheadTimer.current);
      typeaheadTimer.current = window.setTimeout(() => { typeahead.current = ''; }, 500);
      const match = enabledIndexes.find((index) => items[index].label.toLowerCase().startsWith(typeahead.current));
      if (match !== undefined) { event.preventDefault(); onActiveIndexChange(match); }
    }
  };

  return createPortal(
    <div
      ref={menuRef}
       id={menuId}
       role={role}
       aria-labelledby={labelledBy}
       aria-label={ariaLabel}
       aria-activedescendant={activeDescendant}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={cn('fixed z-[100] max-h-[min(20rem,calc(100vh-1rem))] min-w-40 overflow-auto rounded-md border border-dropdown bg-popover p-1 text-popover-foreground shadow-dropdown outline-none', className)}
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
    >
      {items.map((item, index) => (
        <button
           key={item.value}
           id={`${menuId}-option-${item.value}`}
          type="button"
          role={role === 'listbox' ? 'option' : 'menuitem'}
           aria-selected={role === 'listbox' ? item.value === selectedValue : undefined}
          aria-disabled={item.disabled || undefined}
          disabled={item.disabled}
          data-value={item.value}
           data-highlighted={index === activeIndex || undefined}
           tabIndex={-1}
          className="flex w-full cursor-default items-center rounded-sm px-3 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
           onMouseDown={(event) => event.preventDefault()}
           onMouseMove={() => { if (!item.disabled) onActiveIndexChange(index); }}
          onClick={() => { if (!item.disabled) onSelect(item.value); }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
