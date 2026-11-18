import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { HomePage } from './pages/HomePage';
import { AnalyzerPage } from './pages/AnalyzerPage';
import { RetainedWizard } from './components/wizard/RetainedWizard';
import { SettingsPage } from './pages/SettingsPage';
import { AboutPage } from './pages/AboutPage';
import { DatabaseEditorPage } from './pages/DatabaseEditorPage';
import { useAppStore } from './store/useAppStore';
import { useApiStore } from './store/useApiStore';
import { Home, ScanText, Layers, Database, Settings, Info, Cloud, Laptop, Settings2 } from 'lucide-react';
import { registerAppCloseHook } from './services/appLifecycle';

// Simple Layout wrapper
export const Layout = ({ children }: { children: React.ReactNode }) => {
  const { t, i18n } = useTranslation();
  const { theme, language, transportNotice, useOfflineMode, transportStatus } = useAppStore();
  const location = useLocation();

  // Follow changes to the operating system when the system theme is selected.
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (media?.matches ? 'dark' : 'light') : theme;
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(resolved);
    };
    apply();
    if (theme !== 'system') return;
    media?.addEventListener?.('change', apply);
    return () => media?.removeEventListener?.('change', apply);
  }, [theme]);

  // Apply language to both translations and assistive technology.
  useEffect(() => {
    document.documentElement.lang = language;
    if (i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  // Initial model and database activity loads
  useEffect(() => {
    const { models, refreshModels } = useApiStore.getState();
    if (Object.keys(models).length === 0) void refreshModels();
  }, []);



  const isActive = (path: string) => location.pathname === path;

  const navigation = [
    { path: '/', key: 'design.overview', icon: Home },
    { path: '/analyzer', key: 'home.analyzer.title', icon: ScanText },
    { path: '/wizard', key: 'design.wordWizard', icon: Layers },
    { path: '/database', key: 'nav.database', icon: Database },
  ];
  const mode = transportNotice === 'offline-fallback' ? 'design.fallback'
    : useOfflineMode || transportStatus === 'offline' ? 'design.localMode' : 'design.onlineMode';

  const navItem = ({ path, key, icon: Icon }: typeof navigation[number]) => (
    <Link key={path} to={path} aria-current={isActive(path) ? 'page' : undefined}
      className={`sidebar-link ${isActive(path) ? 'is-active' : ''}`}>
      <Icon aria-hidden="true" size={22} /><span>{t(key)}</span>
    </Link>
  );

  return (
    <div className="app-shell min-h-screen bg-background text-foreground font-sans">
      <a href="#workspace" className="skip-link">{t('design.skip')}</a>
      <aside className="app-sidebar">
        <Link to="/" className="sidebar-brand" aria-label="MorphoDiTa4">
          <strong>MorphoDiTa<span>4</span></strong><span>{t('design.workshop')}</span>
        </Link>
        <nav aria-label={t('design.navigation')} className="sidebar-nav">{navigation.map(navItem)}</nav>
        <div className="sidebar-bottom">
          <nav aria-label={t('nav.settings')}>
            {navItem({ path: '/settings', key: 'nav.settings', icon: Settings })}
            {navItem({ path: '/about', key: 'nav.about', icon: Info })}
          </nav>
          <span className="sidebar-version">{t('about.version', { version: '0.1.21' })}</span>
        </div>
      </aside>
      <div id="workspace" className="app-workspace" tabIndex={-1}>
        <div className="workspace-mode"><Link to="/settings" title={t('nav.settings')} className={`mode-badge ${transportNotice === 'offline-fallback' ? 'status-warning' : ''}`}>
          {useOfflineMode || transportStatus === 'offline' ? <Laptop size={15} aria-hidden="true" /> : <Cloud size={15} aria-hidden="true" />}
          {t(mode)} <Settings2 size={17} aria-hidden="true"/>
        </Link></div>
        {transportNotice && transportNotice !== 'offline-explicit' && <div role="status" className="transport-notice status-warning">{t(`transport.${transportNotice}`)}</div>}
        {children}
      </div>
    </div>
  );
};

function App() {
  const { t } = useTranslation();
  const [lifecycleError, setLifecycleError] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    void registerAppCloseHook()
      .then((unlisten) => {
        if (disposed) {
          unlisten?.();
        } else {
          cleanup = unlisten;
        }
      })
      .catch(() => {
        if (!disposed) {
          console.error('Application lifecycle registration failed.');
          setLifecycleError(true);
        }
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <BrowserRouter>
      <Layout>
        {lifecycleError && (
          <div role="alert" className="border-b border-destructive/50 bg-destructive/10 px-4 py-3 text-center text-sm text-foreground">
            <p>{t('transport.lifecycle-error')}</p>
            <button type="button" className="mt-2 underline" onClick={() => window.location.reload()}>
              {t('transport.restart')}
            </button>
          </div>
        )}
        <RetainedWizard />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/analyzer" element={<AnalyzerPage />} />
          <Route path="/wizard" element={<></>} />
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
