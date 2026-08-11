import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Card, CardHeader, CardDescription, Button, Badge } from '../components/common';
import { useDbStore } from '../store/useDbStore';
import { ModelSelector } from '../components/analyzer/ModelSelector';

export const HomePage: React.FC = () => {
  const { t } = useTranslation();
  const { recentActivity, isLoading, error, loadSessions } = useDbStore();

  return (
    <div className="flex flex-col">
      <main className="flex-1 container max-w-5xl mx-auto px-4 sm:px-8 py-8 sm:py-12 flex flex-col gap-6 sm:gap-8 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
        <div className="text-center space-y-3 sm:space-y-4 mb-4 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-primary">
            {t('home.title')}
          </h1>
          <p className="text-base sm:text-xl text-muted-foreground max-w-2xl mx-auto">
            {t('home.subtitle')}
          </p>
        </div>

        <div className="mb-4">
          <p className="text-sm text-muted-foreground mb-2">{t('home.modelSelection')}</p>
          <ModelSelector compact />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link to="/analyzer" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <Card glass hoverEffect className="h-full border-primary/20 hover:border-primary/50">
              <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                 <svg aria-hidden="true" className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
                </svg>
              </div>
              <h2 className="text-2xl font-semibold leading-none tracking-tight">{t('home.analyzer.title')}</h2>
              <CardDescription className="text-base mt-2">
                {t('home.analyzer.description')}
              </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link to="/wizard" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <Card glass hoverEffect className="h-full border-accent/20 hover:border-accent/50">
              <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                 <svg aria-hidden="true" className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path>
                </svg>
              </div>
              <h2 className="text-2xl font-semibold leading-none tracking-tight">{t('home.wizard.title')}</h2>
              <CardDescription className="text-base mt-2">
                {t('home.wizard.description')}
              </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>

        <section className="mt-8" aria-labelledby="recent-activity-title">
          <h2 id="recent-activity-title" className="text-lg font-semibold mb-4 text-foreground">
            {t('home.recent_activity')}
           </h2>
          {isLoading ? (
            <p role="status" className="text-sm text-muted-foreground">{t('home.activity.loading')}</p>
          ) : error ? (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-muted-foreground">{t('home.activity.error')}</p>
              <Button variant="secondary" size="sm" onClick={() => void loadSessions().catch(() => undefined)}>
                {t('home.activity.retry')}
              </Button>
            </div>
          ) : recentActivity.length === 0 ? (
            <p role="status" className="text-sm text-muted-foreground">{t('home.activity.empty')}</p>
          ) : (
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[500px]">
                <caption className="sr-only">{t('home.recent_activity')}</caption>
                <thead className="bg-secondary text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t('home.table.operation')}</th>
                    <th className="px-4 py-3 font-medium">{t('home.table.model')}</th>
                    <th className="px-4 py-3 font-medium">{t('home.table.items')}</th>
                    <th className="px-4 py-3 font-medium">{t('home.table.status')}</th>
                    <th className="px-4 py-3 font-medium text-right">{t('home.table.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.map((session) => (
                    <tr key={session.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                      <td className="px-4 py-3 font-medium text-foreground capitalize">
                        {t(`analyzer.operations.${session.operation}`)}
                      </td>
                      <td className="px-4 py-3 text-xs">{session.model}</td>
                      <td className="px-4 py-3">{session.result_count}</td>
                      <td className="px-4 py-3">
                         <Badge variant={session.status === 'completed' ? 'success' : session.status === 'failed' ? 'error' : 'info'}>
                          {t(`home.status.${session.status}`)}
                         </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {session.created_at ? new Date(session.created_at).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
