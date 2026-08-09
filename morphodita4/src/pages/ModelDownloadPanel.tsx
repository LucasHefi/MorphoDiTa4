import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Download, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/common';
import { Button } from '../components/common/Button';
import { useApiStore } from '../store/useApiStore';
import { downloadModel, MODEL_CATALOG } from '../services/modelDownload';

const model = MODEL_CATALOG.models[0];
const archiveSizeMiB = (model.archiveSizeBytes / 1024 / 1024).toFixed(2);

export const ModelDownloadPanel: React.FC = () => {
  const { t } = useTranslation();
  const [consent, setConsent] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!consent) return;
    setIsDownloading(true);
    setMessage(null);
    setError(null);
    try {
      await downloadModel(model.id, consent);
      await useApiStore.getState().refreshModels();
      setMessage(t('settings.modelDownloadSuccess'));
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : String(downloadError));
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Card glass>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-primary" />
          <CardTitle>{t('settings.modelDownloadTitle')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('settings.modelDownloadDescription')}</p>
        <dl className="grid gap-2 text-sm">
          <div>
            <dt className="font-medium">{t('settings.modelLicense')}</dt>
            <dd>
              <a className="inline-flex items-center gap-1 underline" href={model.license.url} target="_blank" rel="noreferrer">
                {model.license.name} <ExternalLink className="h-3 w-3" />
              </a>
            </dd>
          </div>
          <div>
            <dt className="font-medium">{t('settings.modelSource')}</dt>
            <dd>
              <a className="inline-flex items-center gap-1 underline break-all" href={model.sourceUrl} target="_blank" rel="noreferrer">
                {model.sourceUrl} <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </dd>
          </div>
          <div>
            <dt className="font-medium">{t('settings.modelDownloadSize')}</dt>
            <dd>{archiveSizeMiB} MiB</dd>
          </div>
          <div>
            <dt className="font-medium">{t('settings.modelCommercialUse')}</dt>
            <dd>{t('settings.modelCommercialUseNo')}</dd>
          </div>
        </dl>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>{t('settings.modelConsent')}</span>
        </label>
        <Button type="button" onClick={() => void handleDownload()} disabled={!consent} isLoading={isDownloading}>
          {t('settings.modelDownloadButton')}
        </Button>
        {message && (
          <p role="status" className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" /> {message}
          </p>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
};
