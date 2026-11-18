import React from 'react';
import { MODEL_CATALOG } from '../services/modelDownload';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Card, CardHeader, CardTitle, CardContent } from '../components/common';
import { ArrowLeft, ExternalLink, Code2, UserRound, ShieldCheck, Cpu } from 'lucide-react';

export const AboutPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const version = '0.1.21';
  return (
    <div className="flex flex-col">
      <main className="about-page flex-1 container max-w-7xl mx-auto py-8 sm:py-12 px-4 sm:px-8 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
        <div className="flex items-center gap-3">
          <button type="button" aria-label={t('common.back')} onClick={() => navigate(-1)} className="about-back"><ArrowLeft size={20} aria-hidden="true" />{t('common.back')}</button>
          <h1>{t('about.title')}</h1>
        </div>
        <Card className="about-product">
          <CardHeader><div className="about-name-row"><CardTitle>{t('about.name')}</CardTitle><span className="about-version">{t('about.version', { version })}</span></div></CardHeader>
          <CardContent className="space-y-6">
            <p className="about-description">{t('about.description')}</p>
            <div className="about-metadata"><p><UserRound size={30} aria-hidden="true" /><span><small>{t('design.authorLabel')}</small><strong>Lukáš Hefner</strong><a href="https://mediamaker.cz" target="_blank" rel="noreferrer">mediamaker.cz</a></span></p><p><Cpu size={30} aria-hidden="true" /><span className="technology-tags"><small>{t('design.technologyLabel')}</small><span>React</span><span>Tauri</span><span>TypeScript</span></span></p><p><ShieldCheck size={30} aria-hidden="true" /><span><small>{t('design.appLicenseLabel')}</small><strong>MIT</strong></span></p></div>
          </CardContent>
        </Card>
        <Card className="about-licenses">
          <CardHeader><CardTitle>{t('about.modelTitle')}</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {MODEL_CATALOG.models.map((model) => (
              <div key={model.id} className="about-model-row">
                <div><small>{t('design.localModel')}</small><h2>{model.id} · {model.version}</h2></div>
                <div><small>{t('settings.modelSource')}</small><a href={model.sourceUrl} target="_blank" rel="noreferrer">LINDAT <ExternalLink size={16} aria-hidden="true" /></a></div>
                <div><small>{t('settings.modelLicense')}</small><a href={model.license.url} target="_blank" rel="noreferrer">{model.license.name} <ExternalLink size={16} aria-hidden="true" /></a></div>
              </div>
            ))}
            <div className="about-model-warning">{t('design.modelWarning')}</div>
            <p>{t('about.modelTerms')}</p>
          </CardContent>
        </Card>
        <Card className="about-links"><CardContent>
          <div className="server-information"><Code2 size={30} aria-hidden="true" /><div><h2>{t('design.serverTitle')}</h2><div className="server-metadata"><span>1.11.3</span><span className="about-version">MPL 2.0</span><a href="https://github.com/ufal/morphodita/tree/v1.11.3" target="_blank" rel="noreferrer">{t('design.sourceCode')}</a></div><p className="sr-only">{t('about.sidecarLicense')}</p></div></div>
          <a href="https://ufal.mff.cuni.cz/morphodita" target="_blank" rel="noreferrer"><span><small>{t('design.officialSite')}</small>ufal.mff.cuni.cz/morphodita</span> <ExternalLink size={16} aria-hidden="true" /></a>
        </CardContent></Card>
      </main>
    </div>
  );
};
