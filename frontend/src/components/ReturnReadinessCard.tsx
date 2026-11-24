import React from 'react';
import { useTranslation } from '../i18n/I18nContext';

interface ReturnReadinessCardProps {
  totalEntries: number;
  entriesWithoutBlocking: number;
  blockingCount: number;
  className?: string;
}

export const ReturnReadinessCard: React.FC<ReturnReadinessCardProps> = ({
  totalEntries,
  entriesWithoutBlocking,
  blockingCount,
  className = '',
}) => {
  const { t } = useTranslation();

  // Value = round(100 * entries with zero BLOCKING errors / total entries)
  const percentage =
    totalEntries > 0
      ? Math.round((100 * entriesWithoutBlocking) / totalEntries)
      : 100;

  // 76px SVG circle specs
  const radius = 31;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * radius; // ~194.78
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div
      role="region"
      aria-label="Return Readiness Overview"
      className={`w-full bg-primary-deep rounded-[14px] p-4 text-white shadow-md flex items-center justify-between gap-4 ${className}`}
    >
      {/* Left: Text Information */}
      <div className="flex-1 space-y-1">
        <h2 className="text-body font-bold text-on-primary-deep-title tracking-tight">
          {t('readiness.title') || 'Return readiness'}
        </h2>
        <p className="text-secondary text-on-primary-deep-body leading-snug">
          {totalEntries === 0 ? (
            t('readiness.noEntries') || 'No entries yet in this period.'
          ) : (
            <>
              {t('readiness.summary', {
                valid: entriesWithoutBlocking,
                total: totalEntries,
              }) || `${entriesWithoutBlocking} of ${totalEntries} entries have no blocking errors.`}
              {blockingCount > 0 ? (
                <span className="block mt-0.5 text-[12px] font-semibold text-hl-arc">
                  {t('readiness.fixPrompt', { count: blockingCount }) ||
                    `Fix ${blockingCount} to unlock export.`}
                </span>
              ) : (
                <span className="block mt-0.5 text-[12px] font-semibold text-ok-bg">
                  {t('readiness.allClear') || 'All entries compliant! Ready to export.'}
                </span>
              )}
            </>
          )}
        </p>
      </div>

      {/* Right: 76px SVG Radial Progress Ring */}
      <div className="relative shrink-0 w-[76px] h-[76px] flex items-center justify-center">
        <svg
          className="w-[76px] h-[76px] -rotate-90 transform"
          viewBox="0 0 76 76"
          aria-hidden="true"
        >
          {/* Ring track */}
          <circle
            cx="38"
            cy="38"
            r={radius}
            stroke="var(--ring-track)"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Animated Arc */}
          <circle
            cx="38"
            cy="38"
            r={radius}
            stroke="var(--hl-arc)"
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>

        {/* Centered % Label in bold --on-primary-deep-title */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[17px] font-bold text-on-primary-deep-title font-sans">
            {percentage}%
          </span>
        </div>
      </div>
    </div>
  );
};

