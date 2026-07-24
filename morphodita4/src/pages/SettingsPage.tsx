import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { useApiStore } from '../store/useApiStore';
import { Card, CardHeader, CardTitle, CardContent } from '../components/common';
import { Sun, Moon, Monitor, Globe, Info } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { AppState } from '../types/common';

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    theme,
    setTheme,
    language,
    setLanguage,
    useOfflineMode,
    setUseOfflineMode,
    offlineFallbackEnabled,
    setOfflineFallbackEnabled,
    apiBatchSize,
    setApiBatchSize,
    settingsRecoveryNotice,
    dismissSettingsRecovery,
  } = useAppStore();

  const themeOptions: Array<{ value: AppState['theme']; label: string; icon: React.ReactNode }> = [
    { value: 'light', label: t('settings.themes.light'), icon: <Sun className="w-4 h-4" /> },
    { value: 'dark', label: t('settings.themes.dark'), icon: <Moon className="w-4 h-4" /> },
    { value: 'system', label: t('settings.themes.system'), icon: <Monitor className="w-4 h-4" /> },
  ];

  const languageOptions: Array<{ value: AppState['language']; label: string }> = [
    { value: 'cs', label: 'Čeština' },
    { value: 'en', label: 'English' },
    { value: 'pl', label: 'Polski' },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 container max-w-2xl py-12 px-4 sm:px-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h1 className="text-3xl font-bold mb-8 text-foreground">{t('settings.title')}</h1>

        {settingsRecoveryNotice && (
          <div role="alert" className="mb-6 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 text-sm">
            <p>{t('settings.recoveryNotice')}</p>
            <button
              type="button"
              onClick={dismissSettingsRecovery}
              className="mt-2 font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('settings.dismissRecovery')}
            </button>
          </div>
        )}

        <div className="space-y-6">
          <Card glass>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Monitor className="w-5 h-5 text-primary" />
                <CardTitle>{t('settings.theme')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {themeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={theme === option.value}
                    onClick={() => setTheme(option.value)}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all ${
                      theme === option.value
                        ? 'bg-primary text-primary-foreground border-primary shadow-md'
                        : 'bg-secondary/50 text-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {option.icon}
                    <span className="font-medium">{option.label}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card glass>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                <CardTitle>{t('settings.language')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {languageOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={language === option.value}
                    onClick={() => setLanguage(option.value)}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all ${
                      language === option.value
                        ? 'bg-primary text-primary-foreground border-primary shadow-md'
                        : 'bg-secondary/50 text-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    <span className="font-medium">{option.label}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card glass>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-primary" />
                <CardTitle>{t('settings.offlineMode')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useOfflineMode}
                    onChange={(e) => {
                      setUseOfflineMode(e.target.checked);
                      useApiStore.getState().invalidateModels();
                    }}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="font-medium">{t('settings.offlineMode')}</span>
                </label>
                <p className="text-sm text-muted-foreground -mt-2">{t('settings.offlineModeDesc')}</p>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={offlineFallbackEnabled}
                    onChange={(e) => {
                      setOfflineFallbackEnabled(e.target.checked);
                      useApiStore.getState().invalidateModels();
                    }}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="font-medium">{t('settings.offlineFallback')}</span>
                </label>
                <p className="text-sm text-muted-foreground -mt-2">{t('settings.offlineFallbackDesc')}</p>

                <div>
                  <label className="block text-sm font-medium mb-1">{t('settings.batchSize')}</label>
                  <input
                    type="number"
                    min={10}
                    max={500}
                    value={apiBatchSize}
                    onChange={(e) => setApiBatchSize(Math.max(10, Math.min(500, parseInt(e.target.value) || 50)))}
                    className="w-32 px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('settings.batchSizeDesc')}</p>
                </div>
              </div>
            </CardContent>
          </Card>

<Card glass>
             <CardHeader>
               <div className="flex items-center gap-2">
                 <Info className="w-5 h-5 text-primary" />
                 <CardTitle>{t('settings.aboutLink')}</CardTitle>
               </div>
             </CardHeader>
             <CardContent>
               <p className="text-sm text-muted-foreground mb-3">{t('about.name')} — {t('about.description')}</p>
               <button
                 onClick={() => navigate('/about')}
                 className="px-4 py-2 rounded-lg border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition"
               >
                 {t('settings.aboutLink')}
               </button>
             </CardContent>
           </Card>

          <Card glass>
             <CardHeader>
               <div className="flex items-center gap-2">
                 <Info className="w-5 h-5 text-primary" />
                 <CardTitle>{t('database.title')}</CardTitle>
               </div>
             </CardHeader>
             <CardContent>
               <p className="text-sm text-muted-foreground mb-3">{t('database.description')}</p>
               <button
                 onClick={() => navigate('/database')}
                 className="px-4 py-2 rounded-lg border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition"
               >
                 {t('settings.databaseEditor')}
               </button>
             </CardContent>
           </Card>
        </div>
      </main>
    </div>
  );
};
