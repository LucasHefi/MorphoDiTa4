import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { HomePage } from './pages/HomePage';
import { AnalyzerPage } from './pages/AnalyzerPage';
import { WizardPage } from './pages/WizardPage';
import { SettingsPage } from './pages/SettingsPage';
import { AboutPage } from './pages/AboutPage';
import { DatabaseEditorPage } from './pages/DatabaseEditorPage';
import { useAppStore } from './store/useAppStore';
import { useApiStore } from './store/useApiStore';
import { Settings as SettingsIcon } from 'lucide-react';

// Simple Layout wrapper
const Layout = ({ children }: { children: React.ReactNode }) => {
  const { t, i18n } = useTranslation();
  const { theme, language, transportNotice } = useAppStore();
  const location = useLocation();

  // Apply theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  // Apply language
  useEffect(() => {
    if (i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  // Initial load effect
  useEffect(() => {
    const { models, refreshModels } = useApiStore.getState();
    if (Object.keys(models).length === 0) void refreshModels();
  }, []);

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans transition-colors duration-300">
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-7xl items-center justify-between px-4 sm:px-8">
          <div className="flex items-center gap-4 sm:gap-8">
            <Link to="/" className="flex font-bold text-primary items-center gap-2 hover:opacity-80 transition-opacity">
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
              </svg>
              <span className="hidden xs:inline">MorphoDiTa4</span>
            </Link>
            <nav className="flex items-center gap-4 sm:gap-6 text-sm font-medium">
              <Link 
                to="/analyzer" 
                className={`transition-colors hover:text-primary ${isActive('/analyzer') ? 'text-primary' : 'text-foreground/60'}`}
              >
                {t('nav.analyzer')}
              </Link>
              <Link 
                to="/wizard" 
                className={`transition-colors hover:text-primary ${isActive('/wizard') ? 'text-primary' : 'text-foreground/60'}`}
              >
                {t('nav.wizard')}
              </Link>
              <Link 
                to="/database" 
                className={`transition-colors hover:text-primary ${isActive('/database') ? 'text-primary' : 'text-foreground/60'}`}
              >
                {t('nav.database')}
              </Link>
              <Link 
                to="/about" 
                className={`transition-colors hover:text-primary ${isActive('/about') ? 'text-primary' : 'text-foreground/60'}`}
              >
                {t('nav.about')}
              </Link>
            </nav>
          </div>
          <Link 
            to="/settings" 
            className={`p-2 rounded-md transition-colors hover:bg-secondary ${isActive('/settings') ? 'text-primary bg-secondary' : 'text-foreground/60'}`}
            title={t('nav.settings')}
            aria-label={t('nav.settings')}
          >
            <SettingsIcon className="w-5 h-5" />
          </Link>
        </div>
      </header>
      {transportNotice && (
        <div role="status" className="border-b border-yellow-500/50 bg-yellow-500/10 px-4 py-2 text-center text-sm text-foreground">
          {t(`transport.${transportNotice}`)}
        </div>
      )}
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/analyzer" element={<AnalyzerPage />} />
          <Route path="/wizard" element={<WizardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/database" element={<DatabaseEditorPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
