import React, { useRef, useState } from 'react';
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
  onTabChange?: (tabId: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, defaultTabId, className, onTabChange }) => {
  const [activeTab, setActiveTab] = useState<string>(defaultTabId || tabs[0]?.id || '');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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
      <div role="tablist" aria-label="Tabs" className="flex border-b border-border mb-4">
        {tabs.map((tab, tabIndex) => (
          <button
            key={tab.id}
            ref={(element) => { tabRefs.current[tab.id] = element; }}
            type="button"
            role="tab"
            id={`${tab.id}-tab`}
            aria-controls={`${tab.id}-panel`}
            aria-selected={activeTab === tab.id}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => handleTabClick(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, tabIndex)}
            className={cn(
              "px-4 py-2 font-medium text-sm transition-colors relative",
              activeTab === tab.id
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>
      <div
        className="mt-2"
        role="tabpanel"
        id={`${activeTab}-panel`}
        aria-labelledby={`${activeTab}-tab`}
        tabIndex={0}
      >
        {tabs.find((tab) => tab.id === activeTab)?.content}
      </div>
    </div>
  );
};
