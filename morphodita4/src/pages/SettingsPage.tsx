import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { useApiStore } from '../store/useApiStore';
import { Card, CardHeader, CardTitle, CardContent } from '../components/common';
import { Sun, Moon, Monitor, Globe, Info, Database, ArrowRight, SlidersHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { AppState } from '../types/common';
import { ModelDownloadPanel } from './ModelDownloadPanel';

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { theme, setTheme, language, setLanguage, useOfflineMode, setUseOfflineMode,
    offlineFallbackEnabled, setOfflineFallbackEnabled, apiBatchSize, setApiBatchSize,
    settingsRecoveryNotice, dismissSettingsRecovery } = useAppStore();
  const themes: Array<{ value: AppState['theme']; icon: React.ReactNode }> = [
    { value: 'light', icon: <Sun size={18} /> }, { value: 'dark', icon: <Moon size={18} /> }, { value: 'system', icon: <Monitor size={18} /> },
  ];
  return (
    <div className="flex flex-col">
      <main className="settings-page flex-1 container max-w-7xl mx-auto py-8 sm:py-12 px-4 sm:px-8 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
        <h1>{t('settings.title')}</h1>
        <p className="page-subtitle">{t('design.settingsSubtitle')}</p>
        {settingsRecoveryNotice && <div role="alert" className="help-strip mb-5"><span>{t('settings.recoveryNotice')}</span><button type="button" onClick={dismissSettingsRecovery}>{t('settings.dismissRecovery')}</button></div>}
        <nav className="settings-anchors" aria-label={t('settings.title')}>
          <a href="#appearance"><Monitor size={20} aria-hidden="true" />{t('design.appearance')}</a>
          <a href="#processing"><SlidersHorizontal size={20} aria-hidden="true" />{t('design.processing')}</a>
          <a href="#local-model"><Database size={20} aria-hidden="true" />{t('design.localModel')}</a>
        </nav>
        <div className="settings-layout">
          <Card id="appearance" className="appearance-panel">
            <CardHeader><CardTitle><Monitor size={25} aria-hidden="true" />{t('design.appearance')}</CardTitle></CardHeader>
            <CardContent>
              <h2>{t('settings.theme')}</h2>
              <div className="theme-choices">
                {themes.map((option) => <button type="button" key={option.value} className="theme-choice" aria-pressed={theme === option.value} onClick={() => setTheme(option.value)}>
                  <span className="theme-preview" data-theme={option.value} aria-hidden="true"><i /><i /><i /></span>
                  <span className="theme-label"><span aria-hidden="true">{option.icon}</span>{t(`settings.themes.${option.value}`)}</span>
                </button>)}
              </div>
            </CardContent>
            <CardContent className="appearance-language">
              <h2><Globe size={22} aria-hidden="true" />{t('settings.language')}</h2>
              <div className="language-choices">
                {([{ value: 'cs', label: 'Čeština' }, { value: 'en', label: 'English' }, { value: 'pl', label: 'Polski' }] as const).map((option) =>
                  <button type="button" key={option.value} aria-pressed={language === option.value} onClick={() => setLanguage(option.value)}>{option.label}</button>)}
              </div>
            </CardContent>
          </Card>
          <div className="settings-right">
            <Card id="processing" className="settings-processing">
              <CardHeader><CardTitle><SlidersHorizontal size={25} aria-hidden="true" />{t('design.processing')}</CardTitle></CardHeader>
              <CardContent>
                <div className="setting-toggle-row"><div><label htmlFor="settings-offline-mode">{t('settings.offlineMode')}</label><p>{t('settings.offlineModeDesc')}</p></div>
                  <input id="settings-offline-mode" type="checkbox" checked={useOfflineMode} onChange={(event) => { setUseOfflineMode(event.target.checked); useApiStore.getState().invalidateModels(); }} /></div>
                <div className="setting-toggle-row"><div><label htmlFor="settings-offline-fallback">{t('settings.offlineFallback')}</label><p>{t('settings.offlineFallbackDesc')}</p></div>
                  <input id="settings-offline-fallback" type="checkbox" checked={offlineFallbackEnabled} onChange={(event) => { setOfflineFallbackEnabled(event.target.checked); useApiStore.getState().invalidateModels(); }} /></div>
                <div className="setting-batch-row"><div><label htmlFor="settings-batch-size">{t('settings.batchSize')}</label><p>{t('settings.batchSizeDesc')}</p></div>
                  <input id="settings-batch-size" type="number" min={10} max={500} value={apiBatchSize} onChange={(event) => setApiBatchSize(Math.max(10, Math.min(500, parseInt(event.target.value) || 50)))} /></div>
              </CardContent>
            </Card>
            <div id="local-model"><ModelDownloadPanel compact /></div>
          </div>
          <button type="button" className="settings-shortcut" onClick={() => navigate('/about')}><Info size={27} aria-hidden="true" /><span><strong>{t('settings.aboutLink')}</strong><small>{t('about.name')} · {t('about.license')}</small></span><ArrowRight size={20} aria-hidden="true" /></button>
          <button type="button" className="settings-shortcut" onClick={() => navigate('/database')}><Database size={27} aria-hidden="true" /><span><strong>{t('settings.databaseEditor')}</strong><small>{t('database.description')}</small></span><ArrowRight size={20} aria-hidden="true" /></button>
        </div>
      </main>
    </div>
  );
};
