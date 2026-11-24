import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar,
  Camera,
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  Info,
  Clock,
  ArrowRight,
  FileText,
  RefreshCw,
  WifiOff
} from 'lucide-react';
import { api, onColdStartChange } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n/I18nContext';
import { DashboardResponse, TopIssueOut, DeadlineOut, RecentDocumentOut } from '../types';

interface HomeScreenProps {
  onNavigateToScan: () => void;
  onNavigateToReview: (entryId?: number, filter?: 'all' | 'blocking') => void;
  onNavigateToExport: () => void;
  onOpenAuth?: () => void;
  period?: string;
  onPeriodChange?: (period: string) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onNavigateToScan,
  onNavigateToReview,
  onNavigateToExport,
  onOpenAuth,
  period = '2026-11',
  onPeriodChange
}) => {
  const { user } = useAuth();
  const { t, language } = useTranslation();

  const [selectedPeriod, setSelectedPeriod] = useState<string>(period);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isColdStarting, setIsColdStarting] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const [offlineLastUpdated, setOfflineLastUpdated] = useState<string | null>(null);

  // Sync internal period with prop if changed externally
  useEffect(() => {
    if (period && period !== selectedPeriod) {
      setSelectedPeriod(period);
    }
  }, [period]);

  // Subscribe to API cold start notices (> 3s requests)
  useEffect(() => {
    const unsubscribe = onColdStartChange((cold) => {
      setIsColdStarting(cold);
    });
    return unsubscribe;
  }, []);

  // Online / Offline listeners
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch dashboard data
  const fetchDashboard = useCallback(async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.dashboard.get(p);
      setData(resp);
      // Cache response for offline fallback
      try {
        const cachePayload = {
          data: resp,
          timestamp: new Date().toISOString()
        };
        localStorage.setItem(`khatagst_dashboard_${p}`, JSON.stringify(cachePayload));
      } catch {
        // Storage quota exceeded or disabled
      }
    } catch (err: any) {
      console.error('Failed to load dashboard:', err);
      // Attempt to load from offline cache
      const cached = localStorage.getItem(`khatagst_dashboard_${p}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setData(parsed.data);
          setIsOffline(true);
          setOfflineLastUpdated(parsed.timestamp);
        } catch {
          setError(err.message || 'Unable to load dashboard data. Please retry.');
        }
      } else {
        setError(err.message || 'Unable to load dashboard data. Please retry.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard(selectedPeriod);
  }, [selectedPeriod, fetchDashboard]);

  const handlePeriodChange = (newPeriod: string) => {
    setSelectedPeriod(newPeriod);
    if (onPeriodChange) {
      onPeriodChange(newPeriod);
    }
  };

  // Indian digit grouping INR formatter
  const formatInr = useCallback((amount: number) => {
    return new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
      maximumFractionDigits: 0
    }).format(amount);
  }, [language]);

  // Locale date formatter
  const formatDate = useCallback((dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }, [language]);

  // Greeting determination
  const greetingText = useMemo(() => {
    const hour = new Date().getHours();
    const name = user?.business_name || user?.email?.split('@')[0] || (language === 'hi' ? 'व्यापारी' : 'Trader');
    if (hour < 12) {
      return t('home.greetingMorning', { name });
    } else if (hour < 17) {
      return t('home.greetingAfternoon', { name });
    } else {
      return t('home.greetingEvening', { name });
    }
  }, [user, language, t]);

  // Scheme formatting
  const schemeDisplay = useMemo(() => {
    if (data?.scheme) return data.scheme;
    const raw = String(user?.scheme || 'REGULAR').toUpperCase();
    if (raw.includes('COMP')) return 'Composition';
    if (raw.includes('QRMP')) return 'QRMP';
    return 'Regular';
  }, [data?.scheme, user?.scheme]);

  // Check prefers-reduced-motion safely
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }, []);

  // Readiness circle calculation (76px diameter, radius 31, strokeWidth 6)
  const radius = 31;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * radius; // ~194.78
  const readinessPct = data?.readiness_pct ?? 0;
  const strokeDashoffset = circumference - (readinessPct / 100) * circumference;

  // Next action handler
  const handleNextAction = () => {
    if (!data) return;
    const key = data.next_action.key;
    if (key === 'scan_first_bill') {
      onNavigateToScan();
    } else if (key === 'review_entries') {
      onNavigateToReview();
    } else if (key === 'fix_blocking_errors') {
      onNavigateToReview(undefined, 'blocking');
    } else if (key === 'export_return') {
      onNavigateToExport();
    } else {
      onNavigateToReview();
    }
  };

  // Next action button label
  const nextActionButtonLabel = useMemo(() => {
    if (!data) return t('home.reviewEntries', { count: '' });
    const { key, params } = data.next_action;
    if (key === 'scan_first_bill') {
      return t('home.scanFirstBill');
    } else if (key === 'review_entries') {
      return t('home.reviewEntries', { count: params?.count ?? '' });
    } else if (key === 'fix_blocking_errors') {
      return t('home.fixBlockingErrors', { count: params?.count ?? data.errors.blocking });
    } else if (key === 'export_return') {
      return t('home.exportReturn');
    }
    return t('home.reviewEntries', { count: '' });
  }, [data, t]);

  // Hero card description
  const heroDescription = useMemo(() => {
    if (!data || data.entries_total === 0) {
      return t('home.noEntriesHero');
    }
    if (data.errors.blocking > 0) {
      return t('home.blockingSummary', { count: data.errors.blocking });
    }
    return t('home.allClear');
  }, [data, t]);

  // Days remaining helper for upcoming filing deadlines
  const getDaysRemainingInfo = useCallback((dueDateStr: string, verified: boolean) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(dueDateStr);
      due.setHours(0, 0, 0, 0);
      const diffMs = due.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return {
          label: t('home.today'),
          isOverdue: false
        };
      } else if (diffDays < 0) {
        // "Do not show red 'overdue' styling unless verified=true"
        return {
          label: t('home.overdue'),
          isOverdue: verified // strictly verified only
        };
      } else {
        return {
          label: t('home.daysRemaining', { days: diffDays }),
          isOverdue: false
        };
      }
    } catch {
      return { label: dueDateStr, isOverdue: false };
    }
  }, [t]);

  // Rule message translator helper
  const formatRuleMessage = useCallback((issue: TopIssueOut) => {
    if (issue.rule_id === 'R01') {
      return language === 'hi'
        ? "जीएसटीआईएन चेक डिजिट मेल नहीं खाता। बिल पर नंबर पुनः जांचें।"
        : "The GSTIN check digit doesn't match. Re-check the number on the bill.";
    }
    if (issue.rule_id === 'R02') {
      return language === 'hi'
        ? "कर गणना (मूल्य × दर) मेल नहीं खाती।"
        : "Tax arithmetic (taxable value × rate) does not match taxes.";
    }
    if (issue.rule_id === 'R03') {
      return language === 'hi'
        ? "आपूर्ति स्थान राज्य के अनुसार आईजीएसटी या सीजीएसटी/एसजीएसटी की पुष्टि करें।"
        : "Place of supply mismatch: confirm IGST vs CGST/SGST based on state.";
    }
    if (issue.rule_id === 'R04') {
      return language === 'hi'
        ? "दर ड्राफ्ट तालिका से भिन्न है। दर की पुष्टि करें।"
        : "Rate differs from statutory schedule. Confirm rate.";
    }
    return t(issue.message_key) || `${issue.rule_id}: Issue detected`;
  }, [language, t]);

  return (
    <div className="space-y-4 pb-4">
      {/* Cold Start Banner */}
      {isColdStarting && (
        <div
          role="status"
          aria-live="polite"
          className="p-3 bg-surface border border-warning-border rounded-xl text-ink text-xs flex items-center justify-between shadow-sm animate-pulse"
        >
          <div className="flex items-center space-x-2">
            <RefreshCw className="w-4 h-4 text-warning-text animate-spin shrink-0" />
            <span className="font-medium text-warning-text">
              {t('home.wakingUp')}
            </span>
          </div>
        </div>
      )}

      {/* Offline Status Notice */}
      {isOffline && (
        <div
          role="status"
          className="p-2.5 bg-ground border border-border rounded-xl text-ink text-xs flex items-center justify-between shadow-sm"
        >
          <div className="flex items-center space-x-2">
            <WifiOff className="w-4 h-4 text-muted shrink-0" />
            <span className="text-secondary text-ink font-medium">
              {offlineLastUpdated
                ? t('home.offlineBadge', { time: formatDate(offlineLastUpdated) })
                : t('home.offlineBadge', { time: 'recently' })}
            </span>
          </div>
        </div>
      )}

      {/* 1. Header Greeting & Global Period Selector */}
      <div className="bg-surface rounded-xl p-4 border border-border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-ink tracking-tight">
            {greetingText}
          </h1>
          <p className="text-xs text-secondary text-muted">
            <span className="font-semibold text-ink">{schemeDisplay}</span> scheme
          </p>
        </div>

        {/* Global Period Selector */}
        <div className="flex items-center space-x-2 bg-ground border border-border rounded-lg px-3 py-1.5 text-xs text-ink self-start sm:self-auto min-h-[44px]">
          <Calendar className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
          <label htmlFor="home-period-input" className="font-semibold text-muted sr-only sm:not-sr-only">
            Period:
          </label>
          <input
            id="home-period-input"
            type="month"
            aria-label="Filing Period"
            value={selectedPeriod}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="bg-transparent focus:outline-none font-semibold text-ink cursor-pointer"
          />
        </div>
      </div>

      {/* Loading Skeleton State */}
      {loading && !data && (
        <div className="space-y-4" aria-label="Loading dashboard">
          <div className="h-44 bg-surface border border-border rounded-[14px] p-4 animate-pulse" />
          <div className="grid grid-cols-1 min-[360px]:grid-cols-3 gap-2 sm:gap-3">
            <div className="h-24 bg-surface border border-border rounded-xl animate-pulse" />
            <div className="h-24 bg-surface border border-border rounded-xl animate-pulse" />
            <div className="h-24 bg-surface border border-border rounded-xl animate-pulse" />
          </div>
          <div className="h-32 bg-surface border border-border rounded-xl animate-pulse" />
        </div>
      )}

      {/* Error State */}
      {error && !data && (
        <div
          role="alert"
          className="bg-surface rounded-xl p-6 border border-blocking-border/60 shadow-sm text-center space-y-3"
        >
          <AlertOctagon className="w-8 h-8 text-blocking-text mx-auto" />
          <p className="text-sm font-semibold text-blocking-text">{error}</p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => fetchDashboard(selectedPeriod)}
              className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-hover min-h-[44px] transition-colors"
            >
              {t('home.retry')}
            </button>
            {onOpenAuth && (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-4 py-2 border border-border bg-ground text-ink text-xs font-bold rounded-lg hover:bg-border/40 min-h-[44px] transition-colors"
              >
                {language === 'hi' ? 'लॉगिन / खाता बनाएं' : 'Log In / Register'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Dashboard Content */}
      {data && (
        <>
          {/* 3. Readiness Hero Card */}
          <div
            role="region"
            aria-label="Return Readiness Overview"
            className="w-full bg-primary-deep rounded-[14px] p-4 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            {/* Left: Headline & Button */}
            <div className="flex-1 space-y-2">
              <h2 className="text-sm sm:text-base font-bold text-on-primary-deep-title tracking-tight">
                {t('readiness.title')}
              </h2>
              <p className="text-xs sm:text-sm text-on-primary-deep-body leading-snug">
                {heroDescription}
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleNextAction}
                  disabled={isOffline && data.next_action.key === 'scan_first_bill'}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover active:bg-primary-hover text-white text-xs sm:text-sm font-bold min-h-[44px] shadow-sm transition-colors focus:ring-2 focus:ring-white focus:outline-none"
                >
                  <span>{nextActionButtonLabel}</span>
                  <ArrowRight className="w-4 h-4 stroke-[2]" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Right: Circular Readiness Arc (76px) */}
            <div className="relative w-[76px] h-[76px] flex-shrink-0 self-center sm:self-auto">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 76 76" aria-hidden="true">
                {/* Track Circle */}
                <circle
                  cx="38"
                  cy="38"
                  r={radius}
                  style={{ stroke: 'var(--ring-track)' }}
                  strokeWidth={strokeWidth}
                  fill="transparent"
                />
                {/* Arc Circle (Lavender) */}
                <circle
                  cx="38"
                  cy="38"
                  r={radius}
                  style={{
                    stroke: 'var(--hl-arc)',
                    transition: prefersReducedMotion ? 'none' : 'stroke-dashoffset 0.6s ease-in-out'
                  }}
                  strokeWidth={strokeWidth}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              {/* Readiness Percentage Text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-lg font-extrabold text-white font-mono leading-none">
                  {readinessPct}%
                </span>
              </div>
            </div>
          </div>

          {/* Empty Period State: if entries_total === 0, replace stat tiles & issues */}
          {data.entries_total === 0 ? (
            <div
              role="region"
              aria-label="Empty State"
              className="bg-surface rounded-xl p-8 border border-border shadow-sm text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-ground border border-border flex items-center justify-center mx-auto text-muted">
                <FileText className="w-6 h-6 stroke-[1.5]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-ink">
                  {t('home.emptyState', { period: selectedPeriod })}
                </h3>
              </div>
              <button
                type="button"
                onClick={onNavigateToScan}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs sm:text-sm font-bold min-h-[44px] transition-colors shadow-sm"
              >
                <Camera className="w-4 h-4" />
                <span>{t('home.scanBill')}</span>
              </button>
            </div>
          ) : (
            <>
              {/* 4. Three Stat Tiles */}
              <div className="space-y-1">
                <div className="grid grid-cols-1 min-[360px]:grid-cols-3 gap-2 sm:gap-3">
                  {/* Tile 1: Sales */}
                  <div className="bg-surface p-3.5 rounded-xl border border-border shadow-sm space-y-1">
                    <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                      {t('home.sales')}
                    </p>
                    <p className="text-lg sm:text-xl font-bold text-ink font-mono tracking-tight">
                      ₹{formatInr(data.totals.sales)}
                    </p>
                    {data.totals.excluded_entries > 0 && (
                      <p className="text-[10px] text-warning-text leading-tight pt-0.5">
                        {t('home.excludedNotice', { count: data.totals.excluded_entries })}
                      </p>
                    )}
                  </div>

                  {/* Tile 2: Tax collected */}
                  <div className="bg-surface p-3.5 rounded-xl border border-border shadow-sm space-y-1">
                    <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                      {t('home.taxCollected')}
                    </p>
                    <p className="text-lg sm:text-xl font-bold text-ink font-mono tracking-tight">
                      ₹{formatInr(data.totals.tax_collected)}
                    </p>
                    {data.totals.excluded_entries > 0 && (
                      <p className="text-[10px] text-warning-text leading-tight pt-0.5">
                        {t('home.excludedNotice', { count: data.totals.excluded_entries })}
                      </p>
                    )}
                  </div>

                  {/* Tile 3: Purchases (ITC) */}
                  <div className="bg-surface p-3.5 rounded-xl border border-border shadow-sm space-y-1">
                    <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                      {t('home.purchasesItc')}
                    </p>
                    <p className="text-lg sm:text-xl font-bold text-ink font-mono tracking-tight">
                      ₹{formatInr(data.totals.purchases_itc)}
                    </p>
                    {data.totals.excluded_entries > 0 && (
                      <p className="text-[10px] text-warning-text leading-tight pt-0.5">
                        {t('home.excludedNotice', { count: data.totals.excluded_entries })}
                      </p>
                    )}
                  </div>
                </div>
                {/* Statutory footnote for clean totals */}
                <p className="text-[11px] text-secondary text-muted px-1">
                  {t('home.totalsDisclaimer')}
                </p>
              </div>

              {/* 5. "Needs your attention" Card */}
              <div
                role="region"
                aria-label={t('home.needsAttention')}
                className="bg-surface rounded-xl p-4 border border-border shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs sm:text-sm font-bold text-ink">
                    {t('home.needsAttention')}
                  </h3>
                  {data.errors.blocking > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blocking-bg text-blocking-text border border-blocking-border">
                      {data.errors.blocking} blocking
                    </span>
                  )}
                </div>

                {data.top_issues.length === 0 ? (
                  <div className="flex items-center gap-2 p-3 bg-ok-bg/30 border border-ok-border/50 rounded-lg text-ok-text text-xs font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-ok-text" />
                    <span>{t('home.noIssues')}</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.top_issues.map((issue) => {
                      const isBlocking = data.errors.blocking > 0;
                      return (
                        <div
                          key={issue.rule_id}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-ground border border-border text-xs"
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            {/* Severity Badge with Text Label */}
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 border ${
                                issue.rule_id === 'R01' || issue.rule_id === 'R02'
                                  ? 'bg-blocking-bg text-blocking-text border-blocking-border'
                                  : 'bg-warning-bg text-warning-text border-warning-border'
                              }`}
                            >
                              {issue.rule_id === 'R01' || issue.rule_id === 'R02' ? 'Blocking' : 'Warning'}
                            </span>
                            <div className="min-w-0">
                              <p className="text-ink font-medium leading-snug line-clamp-2">
                                {formatRuleMessage(issue)}
                              </p>
                              <span className="text-[10px] text-muted font-mono">
                                {issue.rule_id} • {issue.count} affected
                              </span>
                            </div>
                          </div>

                          {/* Fix button linking to Review */}
                          <button
                            type="button"
                            onClick={() => onNavigateToReview(issue.first_entry_id ?? undefined)}
                            aria-label={`Fix issue ${issue.rule_id}`}
                            className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-hover min-h-[36px] sm:min-h-[44px] shrink-0 transition-colors"
                          >
                            {t('home.fixAction')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* 6. "Upcoming filing dates" Card */}
          <div
            role="region"
            aria-label={t('home.upcomingDates')}
            className="bg-surface rounded-xl p-4 border border-border shadow-sm space-y-3"
          >
            <h3 className="text-xs sm:text-sm font-bold text-ink">
              {t('home.upcomingDates')}
            </h3>

            {data.deadlines.length === 0 ? (
              <p className="text-xs text-muted">No scheduled deadlines.</p>
            ) : (
              <div className="space-y-2">
                {data.deadlines.map((dl) => {
                  const daysInfo = getDaysRemainingInfo(dl.due_date, dl.verified);
                  return (
                    <div
                      key={dl.return_type}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-ground border border-border text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-ink">{dl.return_type}</span>
                          {!dl.verified && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-warning-bg text-warning-text border border-warning-border font-medium">
                              {t('home.unverifiedDate')}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted font-mono">
                          Due: {formatDate(dl.due_date)}
                        </p>
                      </div>

                      {/* Days remaining badge: strictly no red overdue styling unless verified=true */}
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          daysInfo.isOverdue
                            ? 'bg-blocking-bg text-blocking-text border border-blocking-border'
                            : 'bg-surface text-ink border border-border'
                        }`}
                      >
                        {daysInfo.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 7. "Recent uploads" List */}
          <div
            role="region"
            aria-label={t('home.recentUploads')}
            className="bg-surface rounded-xl p-4 border border-border shadow-sm space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-bold text-ink">
                {t('home.recentUploads')}
              </h3>
            </div>

            {data.recent_documents.length === 0 ? (
              <div className="p-3 bg-ground rounded-lg text-center text-xs text-muted">
                {t('home.noUploads')}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {data.recent_documents.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => onNavigateToReview()}
                    className="w-full text-left py-2.5 flex items-center justify-between gap-2 hover:bg-ground/50 px-1 rounded transition-colors"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <FileText className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-ink truncate">
                          {doc.doc_type} #{doc.id}
                        </p>
                        <p className="text-[11px] text-muted">
                          {formatDate(doc.uploaded_at)}
                        </p>
                      </div>
                    </div>

                    {/* Status Badge with text label */}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${
                        doc.status === 'Extracted'
                          ? 'bg-ok-bg text-ok-text border-ok-border'
                          : doc.status === 'Failed'
                          ? 'bg-blocking-bg text-blocking-text border-blocking-border'
                          : 'bg-warning-bg text-warning-text border-warning-border'
                      }`}
                    >
                      {doc.status === 'Extracted'
                        ? t('home.statusExtracted')
                        : doc.status === 'Failed'
                        ? t('home.statusFailed')
                        : t('home.statusNeedsReview')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 8. Footer Note */}
          <p className="text-center text-xs text-secondary text-muted pt-2 pb-1">
            {t('home.footerNote')}
          </p>
        </>
      )}
    </div>
  );
};
