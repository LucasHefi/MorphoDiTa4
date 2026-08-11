import React, { useEffect, useRef, useState } from 'react';
import { cn } from './utils';

export interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

export interface TabsProps {
  tabs: Tab[];
  defaultTabId?: string;
  className?: string;
  ariaLabel?: string;
  onTabChange?: (tabId: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, defaultTabId, className, ariaLabel, onTabChange }) => {
  const [activeTab, setActiveTab] = useState<string>(defaultTabId || tabs[0]?.id || '');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const effectiveActiveTab = tabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : (tabs.some((tab) => tab.id === defaultTabId) ? defaultTabId! : tabs[0]?.id ?? '');

  useEffect(() => {
    if (activeTab !== effectiveActiveTab) {
      setActiveTab(effectiveActiveTab);
      if (effectiveActiveTab) onTabChange?.(effectiveActiveTab);
    }
  }, [activeTab, effectiveActiveTab, onTabChange]);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    if (onTabChange) {
      onTabChange(tabId);
    }
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tabIndex: number) => {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const targetIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : direction === 0
          ? tabIndex
          : (tabIndex + direction + tabs.length) % tabs.length;

    if (targetIndex === tabIndex) return;
    event.preventDefault();
    const targetId = tabs[targetIndex]?.id;
    if (!targetId) return;
    handleTabClick(targetId);
    tabRefs.current[targetId]?.focus();
  };

  return (
    <div className={cn("w-full", className)}>
      <div role="tablist" aria-label={ariaLabel ?? tabs[0]?.label ?? ''} className="flex border-b border-border mb-4">
        {tabs.map((tab, tabIndex) => (
          <button
            key={tab.id}
            ref={(element) => { tabRefs.current[tab.id] = element; }}
            type="button"
            role="tab"
            id={`${tab.id}-tab`}
            aria-controls={`${tab.id}-panel`}
            aria-selected={effectiveActiveTab === tab.id}
            tabIndex={effectiveActiveTab === tab.id ? 0 : -1}
            onClick={() => handleTabClick(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, tabIndex)}
            className={cn(
              "px-4 py-2 font-medium text-sm motion-safe:transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              effectiveActiveTab === tab.id
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {effectiveActiveTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>
      {effectiveActiveTab && (
        <div className="mt-2" role="tabpanel" id={`${effectiveActiveTab}-panel`} aria-labelledby={`${effectiveActiveTab}-tab`} tabIndex={0}>
          {tabs.find((tab) => tab.id === effectiveActiveTab)?.content}
        </div>
      )}
    </div>
  );
};
