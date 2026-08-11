import { ReactNode, useRef, useState } from 'react';
import { FloatingMenu, FloatingMenuItem } from './FloatingMenu';

export interface ContextMenuProps {
  label: string;
  items: FloatingMenuItem[];
  onSelect: (value: string) => void;
  children: ReactNode;
}

export function ContextMenu({ label, items, onSelect, children }: ContextMenuProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number }>();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const restoreRef = useRef<HTMLElement | null>(null);
  const close = () => { setOpen(false); (restoreRef.current ?? targetRef.current)?.focus(); };
  const openAtTarget = () => {
    const rect = targetRef.current?.getBoundingClientRect();
    restoreRef.current = document.activeElement as HTMLElement;
    setAnchor({ x: rect?.left ?? 0, y: rect?.bottom ?? 0 });
    setActiveIndex(items.findIndex((item) => !item.disabled));
    setOpen(true);
  };
  return (
    <div ref={targetRef} tabIndex={-1} onContextMenu={(event) => { event.preventDefault(); restoreRef.current = document.activeElement as HTMLElement; setAnchor({ x: event.clientX, y: event.clientY }); setActiveIndex(items.findIndex((item) => !item.disabled)); setOpen(true); }} onKeyDown={(event) => { if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) { event.preventDefault(); openAtTarget(); } }}>
      {children}
      <FloatingMenu open={open} onClose={close} items={items} onSelect={(value) => { onSelect(value); close(); }} activeIndex={activeIndex} onActiveIndexChange={setActiveIndex} role="menu" anchor={anchor} ariaLabel={label} />
    </div>
  );
}
