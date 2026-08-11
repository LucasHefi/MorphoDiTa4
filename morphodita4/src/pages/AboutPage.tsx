import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Card, CardHeader, CardTitle, CardContent } from '../components/common';
import { ArrowLeft, Info } from 'lucide-react';

export const AboutPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const version = '0.1.0';

  return (
    <div className="flex flex-col">
      <main className="flex-1 container max-w-2xl mx-auto py-8 sm:py-12 px-4 sm:px-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-500">
        <div className="flex items-center gap-3 mb-8">
           <button type="button" aria-label={t('common.back')} onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-secondary">
             <ArrowLeft aria-hidden="true" className="w-5 h-5" />
          </button>
          <h1 className="text-3xl font-bold text-foreground">{t('about.title')}</h1>
        </div>

        <Card glass>
          <CardHeader>
            <div className="flex items-center gap-2">
               <Info aria-hidden="true" className="w-5 h-5 text-primary" />
              <CardTitle>{t('about.name')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-foreground">
            <p>{t('about.author')}</p>
            <p>{t('about.license')}</p>
            <p>{t('about.version', { version })}</p>
            <p>{t('about.description')}</p>
            <p>{t('about.tech')}</p>
            <p className="text-sm text-muted-foreground">{t('about.links')}</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};
