import React, { useState, useEffect } from 'react';
import { onColdStartChange } from '../api/client';
import { useTranslation } from '../i18n/I18nContext';
import { Server, RefreshCw } from 'lucide-react';

export const ColdStartBanner: React.FC = () => {
  const { language } = useTranslation();
  const [isWakingUp, setIsWakingUp] = useState(false);

  useEffect(() => {
    const unsubscribe = onColdStartChange((status) => {
      setIsWakingUp(status);
    });
    return unsubscribe;
  }, []);

  if (!isWakingUp) return null;

  const isHindi = language === 'hi';
  const message = isHindi
    ? 'सर्वर सक्रिय हो रहा है, इसमें 1 मिनट तक लग सकता है...'
    : 'Waking up the server, this can take up to a minute...';
  const retryLabel = isHindi ? 'पुनः प्रयास करें' : 'Retry';

  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-surface border-y border-border px-4 py-2.5 flex items-center justify-between gap-3 text-xs shadow-inner animate-pulse"
    >
      <div className="flex items-center space-x-2 text-ink min-w-0">
        <Server className="w-4 h-4 text-primary shrink-0 stroke-[2]" />
        <span className="font-semibold truncate">{message}</span>
      </div>

      <button
        type="button"
        onClick={handleRetry}
        className="shrink-0 inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-border bg-ground/60 hover:bg-ground text-ink text-xs font-bold transition shadow-sm"
      >
        <RefreshCw className="w-3 h-3 text-muted stroke-[2]" />
        <span>{retryLabel}</span>
      </button>
    </div>
  );
};

