import React from 'react';
import { Database, Calendar, FileText, AlertCircle } from 'lucide-react';
import { useTranslation } from '../i18n/I18nContext';

interface GlobalBannersProps {
  isDemo?: boolean;
  rateTableVersion?: string | null;
  ratesVerified?: boolean;
  className?: string;
}

export const GlobalBanners: React.FC<GlobalBannersProps> = ({
  isDemo = true,
  rateTableVersion = '2023-10-01',
  ratesVerified = false,
  className = ''
}) => {
  const { t } = useTranslation();

  return (
    <div
      role="region"
      aria-label="Compliance status banners"
      className={`w-full flex flex-wrap items-center gap-1.5 px-3 py-2 bg-surface border-b border-border ${className}`}
    >
      {/* 1. DEMO Data Chip */}
      {isDemo && (
        <span
          data-testid="demo-banner"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-semibold bg-demo-chip-bg text-demo-chip-text"
        >
          <Database className="w-3 h-3 text-demo-chip-text" aria-hidden="true" />
          <span>{t('banner.demoChip') || 'DEMO data'}</span>
        </span>
      )}

      {/* 2. Rates Table Version Chip */}
      <span
        data-testid="rates-banner"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-medium bg-chip-neutral text-ink border border-border"
      >
        <Calendar className="w-3 h-3 text-muted" aria-hidden="true" />
        <span>
          {t('banner.ratesChip', { version: rateTableVersion || '2023-10-01' }) ||
            `Rates: ${rateTableVersion || '2023-10-01'}`}
        </span>
        {!ratesVerified && (
          <span className="text-[12px] text-blocking-text font-semibold flex items-center gap-0.5">
            <AlertCircle className="w-3 h-3 text-blocking-text inline" aria-hidden="true" />
            ({t('banner.unverifiedChip') || 'unverified'})
          </span>
        )}
      </span>

      {/* 3. Draft Review Chip */}
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-medium bg-surface text-text-2 border border-border"
      >
        <FileText className="w-3 h-3 text-muted" aria-hidden="true" />
        <span>{t('banner.draftChip') || 'Draft: review before filing'}</span>
      </span>
    </div>
  );
};

