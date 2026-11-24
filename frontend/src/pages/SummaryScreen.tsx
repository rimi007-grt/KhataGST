import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useTranslation } from '../i18n/I18nContext';
import { EntryReviewed, ValidationResponse, SeverityType } from '../types';
import {
  Calendar,
  AlertOctagon,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  TrendingUp,
  Receipt,
  ShoppingCart,
  FileText
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

interface SummaryScreenProps {
  onNavigateToReview?: (entryId?: number) => void;
}

interface UnresolvedFindingItem {
  entryId: number;
  invoiceNo: string;
  partyName: string;
  ruleId: string;
  severity: SeverityType;
  message: string;
}

interface RuleStatItem {
  rule: string;
  label: string;
  count: number;
  severity: 'BLOCKING' | 'WARNING';
}

const ALL_RULES: { id: string; label: string; defaultSeverity: 'BLOCKING' | 'WARNING' }[] = [
  { id: 'R01', label: 'GSTIN', defaultSeverity: 'BLOCKING' },
  { id: 'R02', label: 'Tax Arith', defaultSeverity: 'BLOCKING' },
  { id: 'R03', label: 'POS State', defaultSeverity: 'BLOCKING' },
  { id: 'R04', label: 'Rate/HSN', defaultSeverity: 'BLOCKING' },
  { id: 'R05', label: 'Duplicate', defaultSeverity: 'BLOCKING' },
  { id: 'R06', label: 'Date', defaultSeverity: 'BLOCKING' },
  { id: 'R07', label: 'Mandatory', defaultSeverity: 'BLOCKING' },
  { id: 'R08', label: 'Composition', defaultSeverity: 'BLOCKING' },
  { id: 'R09', label: 'Outlier/Zero', defaultSeverity: 'WARNING' },
  { id: 'R10', label: 'Turnover', defaultSeverity: 'WARNING' },
];

export const SummaryScreen: React.FC<SummaryScreenProps> = ({ onNavigateToReview }) => {
  const { t } = useTranslation();

  const [period, setPeriod] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  const [entries, setEntries] = useState<EntryReviewed[]>([]);
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchSummaryData = async (selectedPeriod: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [entriesData, validationData] = await Promise.all([
        api.entries.list(selectedPeriod),
        api.validation.validate(selectedPeriod)
      ]);
      setEntries(entriesData || []);
      setValidation(validationData || null);
    } catch (err: any) {
      console.error('Failed to load summary data:', err);
      setErrorMsg(err.message || 'Failed to load summary data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummaryData(period);
  }, [period]);

  // Identify entries with BLOCKING validation errors
  const blockingEntryIds = new Set<number>();
  const unresolvedFindings: UnresolvedFindingItem[] = [];
  const ruleCounts: Record<string, { count: number; maxSeverity: 'BLOCKING' | 'WARNING' }> = {};

  ALL_RULES.forEach((r) => {
    ruleCounts[r.id] = { count: 0, maxSeverity: r.defaultSeverity };
  });

  if (validation?.entries) {
    validation.entries.forEach((grp) => {
      const hasBlocking =
        grp.has_blocking ||
        grp.results.some((r) => r.severity === 'BLOCKING');

      if (hasBlocking) {
        blockingEntryIds.add(grp.entry_id);
      }

      grp.results.forEach((res) => {
        const sev = res.severity as SeverityType;
        unresolvedFindings.push({
          entryId: grp.entry_id,
          invoiceNo: grp.invoice_no || `ID-${grp.entry_id}`,
          partyName: grp.party_name || 'Unspecified Party',
          ruleId: res.rule_id,
          severity: sev,
          message: res.message
        });

        // Tally rule counts for chart
        if (ruleCounts[res.rule_id]) {
          ruleCounts[res.rule_id].count += 1;
          if (sev === 'BLOCKING') {
            ruleCounts[res.rule_id].maxSeverity = 'BLOCKING';
          }
        }
      });
    });
  }

  const hasBlockingErrors = blockingEntryIds.size > 0;

  // Stat calculations:
  // "Figures come only from reviewed entries; if there are blocking errors, show a note
  // 'Totals exclude entries with blocking errors' and exclude them. Do not show estimates or projections."
  const cleanEntries = entries.filter((e) => {
    if (hasBlockingErrors) {
      return !blockingEntryIds.has(e.id);
    }
    return true;
  });

  const salesEntries = cleanEntries.filter((e) => e.entry_type === 'SALES');
  const purchaseEntries = cleanEntries.filter((e) => e.entry_type === 'PURCHASE');

  // Stat 1: Sales total
  const salesTotal = salesEntries.reduce((sum, e) => {
    const totalVal = e.total != null
      ? Number(e.total)
      : (Number(e.taxable_value || 0) + Number(e.cgst || 0) + Number(e.sgst || 0) + Number(e.igst || 0));
    return sum + (isNaN(totalVal) ? 0 : totalVal);
  }, 0);

  // Stat 2: Tax collected (on sales)
  const taxCollected = salesEntries.reduce((sum, e) => {
    const tax = Number(e.cgst || 0) + Number(e.sgst || 0) + Number(e.igst || 0);
    return sum + (isNaN(tax) ? 0 : tax);
  }, 0);

  // Stat 3: Purchases (for ITC reconciliation)
  const purchasesTotal = purchaseEntries.reduce((sum, e) => {
    const totalVal = e.total != null
      ? Number(e.total)
      : (Number(e.taxable_value || 0) + Number(e.cgst || 0) + Number(e.sgst || 0) + Number(e.igst || 0));
    return sum + (isNaN(totalVal) ? 0 : totalVal);
  }, 0);

  // Format currency helper
  const formatInr = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Prepare chart data for R01..R10
  const chartData: RuleStatItem[] = ALL_RULES.map((r) => ({
    rule: r.id,
    label: r.label,
    count: ruleCounts[r.id]?.count || 0,
    severity: ruleCounts[r.id]?.maxSeverity || r.defaultSeverity
  }));

  const totalErrorsCount = chartData.reduce((acc, curr) => acc + curr.count, 0);

  if (loading) {
    return (
      <div className="space-y-6 max-w-lg mx-auto pb-8">
        {/* Skeleton Header */}
        <div className="bg-surface rounded-2xl border border-border p-5 animate-pulse space-y-3">
          <div className="h-6 w-36 bg-ground rounded" />
          <div className="h-4 w-52 bg-ground rounded" />
        </div>
        {/* Skeleton Stat Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-surface rounded-2xl border border-border animate-pulse p-4" />
          ))}
        </div>
        {/* Skeleton Chart */}
        <div className="h-64 bg-surface rounded-2xl border border-border animate-pulse p-5" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto pb-8">
      {/* Screen Title & Period Selector */}
      <div className="bg-surface rounded-2xl border border-border p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-ink">
              {t('summaryScreen.title')}
            </h1>
            <p className="text-secondary text-muted">
              {t('summaryScreen.subtitle', { period })}
            </p>
          </div>

          {/* Period selector */}
          <div className="flex items-center space-x-2 bg-ground/60 border border-border rounded-xl px-3 py-2 text-xs text-ink">
            <Calendar className="w-4 h-4 text-muted stroke-[2] flex-shrink-0" />
            <label htmlFor="summaryPeriod" className="font-semibold text-muted text-xs">
              {t('summaryScreen.periodLabel')}:
            </label>
            <input
              id="summaryPeriod"
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-transparent font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-primary rounded px-1"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-blocking-bg text-blocking-text text-xs rounded-xl flex items-center space-x-2 border border-blocking-border">
            <AlertOctagon className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Exclusion Note (Mandatory when blocking errors exist) */}
      {hasBlockingErrors && (
        <div className="p-3.5 bg-warning-bg/40 border border-amber-300 rounded-2xl flex items-start space-x-3 text-warning-text text-xs">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-warning-text stroke-[2] mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-warning-text">
              {t('summaryScreen.blockingExclusionNote')}
            </p>
            <p className="text-[11px] text-muted">
              {`${blockingEntryIds.size} entry(ies) with statutory blocking issues excluded to avoid erroneous tax computations.`}
            </p>
          </div>
        </div>
      )}

      {/* Three Stat Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Tile 1: Sales Total */}
        <div className="bg-surface rounded-2xl border border-border p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted pb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-text-2">
              {t('summaryScreen.salesTotalTitle')}
            </span>
            <Receipt className="w-4 h-4 text-primary stroke-[2]" />
          </div>
          <div className="space-y-0.5 pt-1">
            <p className="text-xl font-bold text-ink tracking-tight">
              {formatInr(salesTotal)}
            </p>
            <p className="text-[11px] text-muted">
              {`${salesEntries.length} reviewed sales`}
            </p>
          </div>
        </div>

        {/* Tile 2: Tax Collected */}
        <div className="bg-surface rounded-2xl border border-border p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted pb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-text-2">
              {t('summaryScreen.taxCollectedTitle')}
            </span>
            <TrendingUp className="w-4 h-4 text-primary stroke-[2]" />
          </div>
          <div className="space-y-0.5 pt-1">
            <p className="text-xl font-bold text-ink tracking-tight">
              {formatInr(taxCollected)}
            </p>
            <p className="text-[11px] text-muted">
              CGST + SGST + IGST
            </p>
          </div>
        </div>

        {/* Tile 3: Purchases (for ITC reconciliation) */}
        <div className="bg-surface rounded-2xl border border-border p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted pb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-text-2">
              {t('summaryScreen.purchasesTitle')}
            </span>
            <ShoppingCart className="w-4 h-4 text-primary stroke-[2]" />
          </div>
          <div className="space-y-0.5 pt-1">
            <p className="text-xl font-bold text-ink tracking-tight">
              {formatInr(purchasesTotal)}
            </p>
            <p className="text-[11px] text-muted">
              {t('summaryScreen.itcSubtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Recharts Bar Chart: Number of Errors by Rule (R01..R10) */}
      <div className="bg-surface rounded-2xl border border-border p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-divider pb-3">
          <div>
            <h2 className="text-sm font-bold text-ink uppercase tracking-wider">
              {t('summaryScreen.chartTitle')}
            </h2>
            <p className="text-[11px] text-muted">
              {t('summaryScreen.chartSubtitle')}
            </p>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
              totalErrorsCount === 0
                ? 'bg-ok-bg text-ok-text'
                : 'bg-blocking-bg text-blocking-text border border-blocking-border'
            }`}
          >
            {totalErrorsCount === 0 ? 'Compliant' : `${totalErrorsCount} issue(s)`}
          </span>
        </div>

        {totalErrorsCount === 0 ? (
          <div className="p-4 bg-ok-bg/30 border border-ok-bg rounded-xl flex items-center space-x-2.5 text-ok-text text-xs">
            <CheckCircle className="w-5 h-5 flex-shrink-0 text-ok-text stroke-[2]" />
            <span className="font-semibold">{t('summaryScreen.noErrorsPassed')}</span>
          </div>
        ) : null}

        {/* Chart Component with aria-label */}
        <div
          className="h-56 w-full pt-2"
          role="region"
          aria-label="Errors by rule chart"
        >
          <ResponsiveContainer width="100%" height={220} minWidth={280}>
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: -24, bottom: 20 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--divider)"
                vertical={false}
              />
              <XAxis
                dataKey="rule"
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
                interval={0}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as RuleStatItem;
                    return (
                      <div className="bg-surface border border-border p-2.5 rounded-xl shadow-lg text-xs space-y-1">
                        <p className="font-bold text-ink">
                          {data.rule}: {data.label}
                        </p>
                        <p className="text-text-2">
                          Errors: <span className="font-bold font-mono">{data.count}</span>
                        </p>
                        <p className="text-[10px] text-muted uppercase">
                          Severity: {data.severity}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((item, index) => {
                  // Severity colors only for severity:
                  // BLOCKING: #A8182B (--blocking-text)
                  // WARNING: #B45309 (--warning-text)
                  // Zero: #CBCAC8 (--divider)
                  const barColor =
                    item.count === 0
                      ? 'var(--chip-neutral)'
                      : item.severity === 'BLOCKING'
                      ? '#A8182B'
                      : '#B45309';
                  return <Cell key={`cell-${index}`} fill={barColor} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* List of Unresolved Errors (linking back to Review card) */}
      <div className="bg-surface rounded-2xl border border-border p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-divider pb-3">
          <div>
            <h2 className="text-sm font-bold text-ink uppercase tracking-wider">
              {t('summaryScreen.unresolvedTitle')}
            </h2>
            <p className="text-[11px] text-muted">
              {t('summaryScreen.unresolvedSubtitle')}
            </p>
          </div>
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-ground text-text-2">
            {unresolvedFindings.length}
          </span>
        </div>

        {unresolvedFindings.length === 0 ? (
          <div className="p-4 bg-ok-bg/30 border border-ok-bg rounded-xl flex items-center space-x-2 text-ok-text text-xs">
            <CheckCircle className="w-4 h-4 flex-shrink-0 text-ok-text stroke-[2]" />
            <span className="font-semibold">{t('summaryScreen.noUnresolved')}</span>
          </div>
        ) : (
          <ul className="space-y-3">
            {unresolvedFindings.map((finding, idx) => (
              <li
                key={`${finding.entryId}-${finding.ruleId}-${idx}`}
                className="p-3.5 rounded-xl border border-border bg-ground/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                        finding.severity === 'BLOCKING'
                          ? 'bg-blocking-bg text-blocking-text border border-blocking-border'
                          : 'bg-warning-bg text-warning-text border border-amber-300'
                      }`}
                    >
                      {finding.severity}
                    </span>
                    <span className="text-xs font-bold text-ink font-mono">
                      {finding.ruleId}
                    </span>
                    <span className="text-xs text-muted">•</span>
                    <span className="text-xs font-semibold text-text-2">
                      {finding.invoiceNo}
                    </span>
                    <span className="text-xs text-muted">({finding.partyName})</span>
                  </div>
                  <p className="text-xs text-ink leading-relaxed">
                    {finding.message}
                  </p>
                </div>

                {onNavigateToReview && (
                  <button
                    type="button"
                    onClick={() => onNavigateToReview(finding.entryId)}
                    className="flex-shrink-0 inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-surface border border-border text-primary font-semibold text-xs hover:bg-ground transition shadow-sm self-start sm:self-center min-h-[44px]"
                  >
                    <span>{t('summaryScreen.fixInReview')}</span>
                    <ArrowRight className="w-3.5 h-3.5 stroke-[2]" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
