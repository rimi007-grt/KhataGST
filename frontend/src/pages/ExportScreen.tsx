import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n/I18nContext';
import { ValidationSummaryOut } from '../types';
import {
  CheckCircle,
  AlertOctagon,
  AlertTriangle,
  FileSpreadsheet,
  FileCode,
  Calendar,
  Share2,
  Copy,
  Check,
  Trash2,
  ArrowRight,
  ShieldCheck,
  Camera,
  Database
} from 'lucide-react';

interface ExportScreenProps {
  onNavigateToReview?: () => void;
  onNavigateToScan?: () => void;
}

export const ExportScreen: React.FC<ExportScreenProps> = ({
  onNavigateToReview,
  onNavigateToScan
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [period, setPeriod] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  const [summary, setSummary] = useState<ValidationSummaryOut | null>(null);
  const [totalEntries, setTotalEntries] = useState<number>(0);
  const [reviewedCount, setReviewedCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [format, setFormat] = useState<'xlsx' | 'json'>('xlsx');
  const [deleteSourceImages, setDeleteSourceImages] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [seedingDemo, setSeedingDemo] = useState<boolean>(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);
  const [exportErrorMsg, setExportErrorMsg] = useState<string | null>(null);

  // CA Share state (P2 feature)
  const [showCaLink, setShowCaLink] = useState<boolean>(false);
  const [caCopied, setCaCopied] = useState<boolean>(false);

  const fetchExportData = async (selectedPeriod: string) => {
    setLoading(true);
    setExportErrorMsg(null);
    setExportSuccessMsg(null);

    try {
      const [sum, entries] = await Promise.all([
        api.validation.summary(selectedPeriod),
        api.entries.list(selectedPeriod)
      ]);

      setSummary(sum);
      setTotalEntries(entries.length);
      setReviewedCount(entries.length); // All entries in reviewed table have passed review
    } catch (err: any) {
      console.error('Failed to load export validation data:', err);
      setExportErrorMsg(err.message || 'Failed to load export data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExportData(period);
  }, [period]);

  const handleSeedDemoData = async () => {
    setSeedingDemo(true);
    setExportErrorMsg(null);
    try {
      await api.entries.seedDemo(period);
      await fetchExportData(period);
    } catch (err: any) {
      console.error('Failed to seed demo data:', err);
      setExportErrorMsg(err.message || 'Failed to seed demo data');
    } finally {
      setSeedingDemo(false);
    }
  };

  const hasBlocking = summary?.has_blocking_errors ?? false;
  const blockingCount = summary?.blocking_count ?? 0;
  const ratesVerified = summary?.rates_verified ?? false;
  const rateVersion = summary?.rate_table_version || '2023-10-01';
  const userScheme = user?.scheme;
  const formatSchemeName = (s?: string | null): string => {
    if (!s) return 'Regular';
    const u = s.toUpperCase();
    if (u === 'REGULAR') return 'Regular';
    if (u === 'COMPOSITION') return 'Composition';
    if (u === 'QRMP') return 'QRMP';
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  };

  // Checklist items real status
  // 1. "No blocking errors" is PASS only when entries exist and blocking = 0
  const item1NoBlockingPass = totalEntries > 0 && !hasBlocking && blockingCount === 0;
  // 2. Return period selected
  const item2PeriodPass = Boolean(period && period.trim().length > 0);
  // 3. Scheme configured
  const item3SchemePass = Boolean(userScheme);
  // 4. Rate table version shown
  const item4RatesPass = Boolean(rateVersion);
  // 5. "Review completed" is PASS only when total entries > 0 and unreviewed = 0
  const item5ReviewPass = totalEntries > 0 && reviewedCount === totalEntries;

  const isChecklistPassed =
    totalEntries > 0 &&
    item1NoBlockingPass &&
    item2PeriodPass &&
    item3SchemePass &&
    item4RatesPass &&
    item5ReviewPass;

  const handleExport = async () => {
    if (!isChecklistPassed) return;

    setIsExporting(true);
    setExportErrorMsg(null);
    setExportSuccessMsg(null);

    try {
      const result = await api.export.download(period, format, deleteSourceImages);
      setExportSuccessMsg(
        t('exportScreen.successExport', { filename: result.filename }) ||
        `Successfully downloaded ${result.filename}!`
      );
    } catch (err: any) {
      setExportErrorMsg(err.message || 'Export failed. Please check errors.');
    } finally {
      setIsExporting(false);
    }
  };

  const caShareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/portal/ca-review?period=${period}&token=ca_ro_${Date.now().toString(36)}`
    : `https://khatagst.app/portal/ca-review?period=${period}`;

  const handleCopyCaLink = async () => {
    try {
      await navigator.clipboard.writeText(caShareUrl);
      setCaCopied(true);
      setTimeout(() => setCaCopied(false), 2500);
    } catch (e) {
      console.error('Clipboard copy failed', e);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 w-full max-w-[480px] mx-auto pb-4">
        {/* Skeleton Header */}
        <div className="bg-surface rounded-2xl border border-border p-4 animate-pulse space-y-3">
          <div className="h-5 w-36 bg-ground rounded" />
          <div className="h-4 w-52 bg-ground rounded" />
        </div>
        {/* Skeleton Checklist */}
        <div className="bg-surface rounded-2xl border border-border p-4 animate-pulse space-y-3">
          <div className="h-5 w-44 bg-ground rounded" />
          <div className="space-y-2.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-ground rounded-xl" />
            ))}
          </div>
        </div>
        {/* Skeleton Button */}
        <div className="h-12 bg-disabled-bg rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full max-w-[480px] mx-auto pb-4">
      {/* Screen Title & Period Selector */}
      <div className="bg-surface rounded-2xl border border-border p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-page-title text-ink">
              {t('exportScreen.title')}
            </h1>
            <p className="text-secondary text-muted">
              {t('exportScreen.subtitle', { period })}
            </p>
          </div>

          {/* Period selector */}
          <div className="flex items-center space-x-2 bg-ground/60 border border-border rounded-xl px-3 py-2 text-xs text-ink self-start sm:self-auto">
            <Calendar className="w-4 h-4 text-muted stroke-[2] flex-shrink-0" />
            <label htmlFor="exportPeriod" className="font-semibold text-muted text-xs">
              {t('exportScreen.periodLabel')}:
            </label>
            <input
              id="exportPeriod"
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-transparent font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-primary rounded px-1"
            />
          </div>
        </div>

        {/* Notifications */}
        {exportSuccessMsg && (
          <div className="p-3 bg-ok-bg text-ok-text text-xs rounded-xl flex items-center space-x-2 border border-ok-border">
            <CheckCircle className="w-4 h-4 flex-shrink-0 text-ok-text" />
            <span className="font-medium">{exportSuccessMsg}</span>
          </div>
        )}
        {exportErrorMsg && (
          <div className="p-3 bg-blocking-bg text-blocking-text text-xs rounded-xl flex items-center space-x-2 border border-blocking-border">
            <AlertOctagon className="w-4 h-4 flex-shrink-0 text-blocking-text" />
            <span className="font-medium">{exportErrorMsg}</span>
          </div>
        )}
      </div>

      {/* CHECKLIST OR EMPTY STATE:
          If zero entries for the selected period, replace the checklist with ONE calm empty state.
          Never show mixed PASS/ACTION items when entries = 0. */}
      {totalEntries === 0 ? (
        <div
          data-testid="export-empty-state"
          className="bg-surface rounded-2xl border border-border p-6 shadow-sm text-center space-y-4"
        >
          <div className="w-12 h-12 mx-auto rounded-full bg-ground border border-border flex items-center justify-center text-muted">
            <FileSpreadsheet className="w-6 h-6 stroke-[1.75]" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-sm font-bold text-ink">
              {t('exportScreen.emptyTitle') || 'No entries for this period'}
            </h2>
            <p className="text-xs text-text-2 max-w-xs mx-auto leading-relaxed">
              {`No entries for ${period}. Scan a bill or choose another period.`}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
            {onNavigateToScan && (
              <button
                type="button"
                onClick={onNavigateToScan}
                style={{ backgroundColor: 'var(--primary)', color: '#FFFFFF' }}
                className="w-full sm:w-auto min-h-[48px] px-5 py-2.5 rounded-xl font-semibold text-xs bg-primary text-white hover:opacity-90 transition flex items-center justify-center gap-1.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                <Camera className="w-4 h-4 text-white" />
                <span>{t('exportScreen.scanButton') || 'Scan bill'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleSeedDemoData}
              disabled={seedingDemo}
              aria-label="Load demo data"
              style={{ backgroundColor: 'var(--demo-chip-bg)', color: 'var(--demo-chip-text)' }}
              className="w-full sm:w-auto min-h-[48px] px-4 py-2.5 rounded-xl font-semibold text-xs bg-demo-chip-bg text-demo-chip-text hover:opacity-90 transition flex items-center justify-center gap-1.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <Database className="w-4 h-4 text-demo-chip-text" />
              <span>{seedingDemo ? 'Loading...' : 'Load DEMO data'}</span>
            </button>
          </div>
        </div>
      ) : (
        /* "Ready to file" Checklist (shown only when totalEntries > 0) */
        <div className="bg-surface rounded-2xl border border-border p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-divider pb-2.5">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-primary stroke-[2]" />
              <h2 className="text-xs font-bold text-ink uppercase tracking-wider">
                {t('exportScreen.checklistTitle')}
              </h2>
            </div>
            <span
              className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                isChecklistPassed
                  ? 'bg-ok-bg text-ok-text'
                  : 'bg-blocking-bg text-blocking-text border border-blocking-border'
              }`}
            >
              {isChecklistPassed ? t('exportScreen.passedBadge') : t('exportScreen.failedBadge')}
            </span>
          </div>

          <ul className="space-y-2">
            {/* Checklist Item 1: No blocking errors */}
            <li
              className={`p-3 rounded-xl border flex items-start justify-between gap-3 ${
                item1NoBlockingPass
                  ? 'bg-ok-bg/30 border-border text-ink'
                  : 'bg-blocking-bg/30 border-blocking-border text-ink'
              }`}
            >
              <div className="flex items-start space-x-2.5">
                {item1NoBlockingPass ? (
                  <CheckCircle className="w-4 h-4 text-ok-text stroke-[2] flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertOctagon className="w-4 h-4 text-blocking-text stroke-[2] flex-shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-ink">
                    {t('exportScreen.noBlockingTitle')}
                  </p>
                  <p className="text-[12px] text-text-2">
                    {item1NoBlockingPass
                      ? t('exportScreen.noBlockingPassed')
                      : t('exportScreen.noBlockingFailed', { count: blockingCount })}
                  </p>
                </div>
              </div>
              {!item1NoBlockingPass && onNavigateToReview && (
                <button
                  type="button"
                  onClick={onNavigateToReview}
                  className="flex-shrink-0 inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-blocking-bg text-blocking-text border border-blocking-border text-xs font-semibold hover:bg-blocking-bg/80 transition"
                >
                  <span>{t('exportScreen.reviewAction')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </li>

            {/* Checklist Item 2: Return period selected */}
            <li
              className={`p-3 rounded-xl border flex items-start justify-between gap-3 ${
                item2PeriodPass
                  ? 'bg-ok-bg/30 border-border text-ink'
                  : 'bg-blocking-bg/30 border-blocking-border text-ink'
              }`}
            >
              <div className="flex items-start space-x-2.5">
                {item2PeriodPass ? (
                  <CheckCircle className="w-4 h-4 text-ok-text stroke-[2] flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertOctagon className="w-4 h-4 text-blocking-text stroke-[2] flex-shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-ink">
                    {t('exportScreen.periodTitle')}
                  </p>
                  <p className="text-[12px] text-text-2">
                    {item2PeriodPass
                      ? t('exportScreen.periodPassed', { period })
                      : t('exportScreen.periodFailed')}
                  </p>
                </div>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                  item2PeriodPass ? 'bg-ok-bg text-ok-text' : 'bg-blocking-bg text-blocking-text'
                }`}
              >
                {item2PeriodPass ? t('exportScreen.passedBadge') : t('exportScreen.failedBadge')}
              </span>
            </li>

            {/* Checklist Item 3: GST filing scheme selected */}
            <li
              className={`p-3 rounded-xl border flex items-start justify-between gap-3 ${
                item3SchemePass
                  ? 'bg-ok-bg/30 border-border text-ink'
                  : 'bg-blocking-bg/30 border-blocking-border text-ink'
              }`}
            >
              <div className="flex items-start space-x-2.5">
                {item3SchemePass ? (
                  <CheckCircle className="w-4 h-4 text-ok-text stroke-[2] flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertOctagon className="w-4 h-4 text-blocking-text stroke-[2] flex-shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-ink">
                    {t('exportScreen.schemeTitle')}
                  </p>
                  <p className="text-[12px] text-text-2">
                    {item3SchemePass
                      ? t('exportScreen.schemePassed', { scheme: formatSchemeName(userScheme) })
                      : t('exportScreen.schemeFailed')}
                  </p>
                </div>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                  item3SchemePass ? 'bg-ok-bg text-ok-text' : 'bg-blocking-bg text-blocking-text'
                }`}
              >
                {item3SchemePass ? t('exportScreen.passedBadge') : t('exportScreen.failedBadge')}
              </span>
            </li>

            {/* Checklist Item 4: Rate table version shown (and verified status) */}
            <li
              className={`p-3 rounded-xl border flex items-start justify-between gap-3 ${
                ratesVerified
                  ? 'bg-ok-bg/30 border-border text-ink'
                  : 'bg-warning-bg/30 border-border text-ink'
              }`}
            >
              <div className="flex items-start space-x-2.5">
                {ratesVerified ? (
                  <CheckCircle className="w-4 h-4 text-ok-text stroke-[2] flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-warning-text stroke-[2] flex-shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-ink">
                    {t('exportScreen.ratesTitle')}
                  </p>
                  <p className="text-[12px] text-text-2">
                    {ratesVerified
                      ? t('exportScreen.ratesPassed', { version: rateVersion })
                      : t('exportScreen.ratesUnverified', { version: rateVersion })}
                  </p>
                </div>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                  ratesVerified
                    ? 'bg-ok-bg text-ok-text'
                    : 'bg-warning-bg text-warning-text'
                }`}
              >
                {ratesVerified ? t('exportScreen.passedBadge') : t('exportScreen.noticeBadge')}
              </span>
            </li>

            {/* Checklist Item 5: Review completed */}
            <li
              className={`p-3 rounded-xl border flex items-start justify-between gap-3 ${
                item5ReviewPass
                  ? 'bg-ok-bg/30 border-border text-ink'
                  : 'bg-blocking-bg/30 border-blocking-border text-ink'
              }`}
            >
              <div className="flex items-start space-x-2.5">
                {item5ReviewPass ? (
                  <CheckCircle className="w-4 h-4 text-ok-text stroke-[2] flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertOctagon className="w-4 h-4 text-blocking-text stroke-[2] flex-shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-ink">
                    {t('exportScreen.reviewTitle')}
                  </p>
                  <p className="text-[12px] text-text-2">
                    {item5ReviewPass
                      ? t('exportScreen.reviewPassed', { count: totalEntries })
                      : t('exportScreen.reviewFailed', { count: totalEntries - reviewedCount })}
                  </p>
                </div>
              </div>
              {!item5ReviewPass && onNavigateToReview && (
                <button
                  type="button"
                  onClick={onNavigateToReview}
                  className="flex-shrink-0 inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-blocking-bg text-blocking-text border border-blocking-border text-xs font-semibold hover:bg-blocking-bg/80 transition"
                >
                  <span>{t('exportScreen.reviewAction')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          </ul>
        </div>
      )}

      {/* Format Choice & Download Card */}
      <div className="bg-surface rounded-2xl border border-border p-4 shadow-sm space-y-4">
        <div>
          <h2 className="text-xs font-bold text-ink uppercase tracking-wider">
            {t('exportScreen.formatChoiceTitle')}
          </h2>
        </div>

        {/* Format Selector Pills / Radios */}
        <div
          role="radiogroup"
          aria-label={t('exportScreen.formatChoiceTitle')}
          className="grid grid-cols-2 gap-2.5"
        >
          {/* Excel Format Option */}
          <button
            type="button"
            role="radio"
            aria-checked={format === 'xlsx'}
            onClick={() => setFormat('xlsx')}
            className={`p-3 rounded-xl border text-left transition min-h-[52px] flex items-start space-x-2.5 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
              format === 'xlsx'
                ? 'bg-surface border-primary ring-1 ring-primary'
                : 'bg-ground/40 border-border hover:bg-ground'
            }`}
          >
            <FileSpreadsheet className={`w-4 h-4 mt-0.5 stroke-[2] ${format === 'xlsx' ? 'text-primary' : 'text-muted'}`} />
            <div>
              <p className="text-xs font-bold text-ink">
                {t('exportScreen.excelFormat')}
              </p>
              <p className="text-[11px] text-muted leading-tight mt-0.5">
                {t('exportScreen.excelDesc')}
              </p>
            </div>
          </button>

          {/* JSON Format Option */}
          <button
            type="button"
            role="radio"
            aria-checked={format === 'json'}
            onClick={() => setFormat('json')}
            className={`p-3 rounded-xl border text-left transition min-h-[52px] flex items-start space-x-2.5 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
              format === 'json'
                ? 'bg-surface border-primary ring-1 ring-primary'
                : 'bg-ground/40 border-border hover:bg-ground'
            }`}
          >
            <FileCode className={`w-4 h-4 mt-0.5 stroke-[2] ${format === 'json' ? 'text-primary' : 'text-muted'}`} />
            <div>
              <p className="text-xs font-bold text-ink">
                {t('exportScreen.jsonFormat')}
              </p>
              <p className="text-[11px] text-muted leading-tight mt-0.5">
                {t('exportScreen.jsonDesc')}
              </p>
            </div>
          </button>
        </div>

        {/* Data Privacy & Source Image Cleanup Checkbox */}
        <div className="p-3 bg-ground/50 rounded-xl border border-border flex items-start space-x-2.5">
          <input
            type="checkbox"
            id="deleteSourceCheckbox"
            checked={deleteSourceImages}
            onChange={(e) => setDeleteSourceImages(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <label htmlFor="deleteSourceCheckbox" className="text-xs text-ink space-y-0.5 cursor-pointer">
            <span className="font-semibold flex items-center space-x-1.5">
              <Trash2 className="w-3.5 h-3.5 text-muted" />
              <span>{t('exportScreen.deleteSourceLabel')}</span>
            </span>
            <span className="text-muted block text-[11px]">
              {t('exportScreen.deleteSourceDesc')}
            </span>
          </label>
        </div>

        {/* Primary Download Button */}
        <div>
          <button
            type="button"
            disabled={!isChecklistPassed || isExporting}
            onClick={handleExport}
            style={{
              backgroundColor: !isChecklistPassed ? 'var(--disabled-bg)' : 'var(--primary)',
              color: !isChecklistPassed ? 'var(--disabled-text)' : '#FFFFFF'
            }}
            className={`w-full min-h-[48px] py-3.5 px-4 rounded-xl font-semibold text-xs flex items-center justify-center space-x-2 shadow-sm transition active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
              !isChecklistPassed
                ? 'bg-disabled-bg text-disabled-text cursor-not-allowed border border-border'
                : 'bg-primary hover:opacity-90 text-white'
            }`}
          >
            {isExporting ? (
              <span>{t('exportScreen.downloading', { format: format.toUpperCase() })}</span>
            ) : (
              <>
                {format === 'xlsx' ? (
                  <FileSpreadsheet className="w-4 h-4 stroke-[2]" />
                ) : (
                  <FileCode className="w-4 h-4 stroke-[2]" />
                )}
                <span>
                  {totalEntries === 0
                    ? 'Export locked: No entries to file'
                    : !isChecklistPassed
                    ? blockingCount > 0
                      ? t('exportScreen.downloadLocked', { count: blockingCount })
                      : t('exportScreen.downloadIncomplete')
                    : t('exportScreen.downloadButton', { format: format.toUpperCase() })}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* "Share with my CA" Section (P2 feature) */}
      <div className="bg-surface rounded-2xl border border-border p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
              {t('exportScreen.shareCaTitle')}
            </h3>
            <p className="text-[11px] text-muted">
              {t('exportScreen.shareCaSubtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCaLink((prev) => !prev)}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-border bg-ground/50 hover:bg-ground text-ink text-xs font-semibold transition"
          >
            <Share2 className="w-3.5 h-3.5 text-muted stroke-[2]" />
            <span>{t('exportScreen.shareCaButton')}</span>
          </button>
        </div>

        {showCaLink && (
          <div className="pt-2 border-t border-divider space-y-2">
            <p className="text-xs text-text-2 font-medium">
              {t('exportScreen.caLinkGenerated')}
            </p>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={caShareUrl}
                aria-label="CA Share Link"
                className="flex-1 bg-ground/60 border border-border rounded-xl px-3 py-2 text-xs text-ink font-mono focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyCaLink}
                className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-semibold flex items-center space-x-1 hover:opacity-90 transition"
              >
                {caCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{t('exportScreen.copied')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{t('exportScreen.copyLink')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Static Statutory Disclaimer */}
      <div className="p-3 rounded-xl border border-border bg-surface text-center">
        <p className="text-xs text-muted font-medium">
          {t('exportScreen.disclaimer')}
        </p>
      </div>
    </div>
  );
};
