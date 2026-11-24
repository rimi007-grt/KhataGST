import React from 'react';
import { AlertCircle, CheckCircle, Info, Calendar } from 'lucide-react';
import { useTranslation } from '../i18n/I18nContext';

interface DemoBannerProps {
  show: boolean;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({ show }) => {
  const { t } = useTranslation();
  if (!show) return null;

  return (
    <div
      role="alert"
      className="bg-demo-chip-bg text-demo-chip-text px-4 py-2 text-xs sm:text-sm font-semibold flex items-center justify-between border-b border-border shadow-sm"
    >
      <div className="flex items-center space-x-2">
        <AlertCircle className="w-4 h-4 text-warning-text flex-shrink-0" />
        <span>{t('banner.demo')}</span>
      </div>
      <span className="uppercase text-[10px] tracking-widest px-2 py-0.5 bg-ground text-ink rounded font-bold flex-shrink-0 ml-2">
        DEMO MODE
      </span>
    </div>
  );
};

interface RatesBannerProps {
  date?: string | null;
  verified?: boolean;
}

export const RatesBanner: React.FC<RatesBannerProps> = ({
  date = '2023-10-01',
  verified = false
}) => {
  const { t } = useTranslation();

  return (
    <div
      role="region"
      aria-label="GST Rates Table Status"
      className="p-3 bg-surface border border-warning-border/60 rounded-xl flex items-center justify-between gap-2 text-ink text-xs shadow-sm"
    >
      <div className="flex items-center space-x-2">
        <AlertCircle className={`w-4 h-4 flex-shrink-0 ${verified ? 'text-ok-text' : 'text-warning-text'}`} />
        <span className="text-secondary text-ink font-medium">
          {verified
            ? t('banner.rates', { date: date || '2023-10-01' })
            : t('banner.unverifiedNotice', { version: date || '2023-10-01' })}
        </span>
      </div>
    </div>
  );
};
