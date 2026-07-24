import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Card, CardHeader, CardTitle, CardDescription } from '../components/common';
import { useDbStore } from '../store/useDbStore';
import { ModelSelector } from '../components/analyzer/ModelSelector';

export const HomePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { recentActivity } = useDbStore();

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 container max-w-5xl py-12 flex flex-col gap-8 animate-in fade-in duration-500">
        <div className="text-center space-y-4 mb-8">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-primary">
            {t('home.title')}
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            {t('home.subtitle')}
          </p>
        </div>

        <div className="mb-4">
          <p className="text-sm text-muted-foreground mb-2">{t('home.modelSelection')}</p>
          <ModelSelector compact />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card 
            glass 
            hoverEffect 
            className="cursor-pointer border-primary/20 hover:border-primary/50"
            onClick={() => navigate('/analyzer')}
          >
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
                </svg>
              </div>
              <CardTitle className="text-2xl">{t('home.analyzer.title')}</CardTitle>
              <CardDescription className="text-base mt-2">
                {t('home.analyzer.description')}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card 
            glass 
            hoverEffect 
            className="cursor-pointer border-accent/20 hover:border-accent/50"
            onClick={() => navigate('/wizard')}
          >
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path>
                </svg>
              </div>
              <CardTitle className="text-2xl">{t('home.wizard.title')}</CardTitle>
              <CardDescription className="text-base mt-2">
                {t('home.wizard.description')}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {recentActivity && recentActivity.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-4 text-foreground">{t('home.recent_activity')}</h3>
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[500px]">
                <thead className="bg-secondary text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Operace</th>
                    <th className="px-4 py-3 font-medium">Model</th>
                    <th className="px-4 py-3 font-medium">Položek</th>
                    <th className="px-4 py-3 font-medium">{t('home.table.status')}</th>
                    <th className="px-4 py-3 font-medium text-right">{t('home.table.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.map((session) => (
                    <tr key={session.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                      <td className="px-4 py-3 font-medium text-foreground capitalize">{session.operation}</td>
                      <td className="px-4 py-3 text-xs">{session.model}</td>
                      <td className="px-4 py-3">{session.result_count}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          session.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                          session.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                          'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}>
                          {session.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {session.created_at ? new Date(session.created_at as string).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
