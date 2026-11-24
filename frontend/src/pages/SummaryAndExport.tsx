import React, { useState, useEffect } from 'react';
import { ValidationSummaryOut } from '../types';
import { api } from '../api/client';
import { DemoBanner, RatesBanner } from '../components/StatutoryBanners';
import { useTranslation } from '../i18n/I18nContext';
import {
  FileSpreadsheet,
  FileCode,
  AlertOctagon,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Trash2,
  ArrowRight,
  ShieldAlert,
  Loader2
} from 'lucide-react';

interface SummaryAndExportProps {
  onNavigateToReview?: () => void;
}

export const SummaryAndExport: React.FC<SummaryAndExportProps> = ({ onNavigateToReview }) => {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  const [summary, setSummary] = useState<ValidationSummaryOut | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [exportingFormat, setExportingFormat] = useState<'xlsx' | 'json' | null>(null);
  const [deleteSourceImages, setDeleteSourceImages] = useState<boolean>(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);
  const [exportErrorMsg, setExportErrorMsg] = useState<string | null>(null);
  const [hasDemoData, setHasDemoData] = useState<boolean>(false);

  const fetchSummary = async (p?: string) => {
    setLoading(true);
    setExportErrorMsg(null);
    setExportSuccessMsg(null);
    try {
      const data = await api.validation.summary(p || undefined);
      setSummary(data);

      // Check if any entries are demo
      const entries = await api.entries.list(p || undefined);
      const isDemo = entries.some((e: any) =>
        e.is_demo === true ||
        (e.invoice_no && e.invoice_no.toUpperCase().includes('DEMO')) ||
        (e.party_name && e.party_name.toUpperCase().includes('DEMO'))
      );
      setHasDemoData(isDemo);
    } catch (err: any) {
      console.error('Failed to fetch validation summary:', err);
      setExportErrorMsg(err.message || 'Failed to load validation summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary(period);
  }, [period]);

  const handleExport = async (format: 'xlsx' | 'json') => {
    if (summary?.has_blocking_errors) {
      setExportErrorMsg('Export is blocked because there are blocking validation errors.');
      return;
    }

    setExportingFormat(format);
    setExportErrorMsg(null);
    setExportSuccessMsg(null);

    try {
      const result = await api.export.download(period, format, deleteSourceImages);
      setExportSuccessMsg(t('summary.successExport', { filename: result.filename }));
    } catch (err: any) {
      setExportErrorMsg(err.message || 'Export failed. Please check errors.');
    } finally {
      setExportingFormat(null);
    }
  };

  const hasBlocking = summary?.has_blocking_errors ?? false;
  const blockingCount = summary?.blocking_count ?? 0;
  const warningCount = summary?.warning_count ?? 0;
  const validCount = summary?.valid_entries ?? 0;
  const totalEntries = summary?.total_entries ?? 0;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Banner: Persistent DEMO DATA Banner */}
      <DemoBanner show={hasDemoData} />

      {/* Top Banner: Mandatory "Rates as of" banner */}
      <RatesBanner
        date={summary?.rate_table_version || '2023-10-01'}
        verified={summary?.rates_verified || false}
      />

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t('summary.title')}</h1>
          <p className="text-xs text-slate-500">
            {t('summary.subtitle')}
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700">
          <Calendar className="w-4 h-4 text-slate-500" />
          <span className="font-semibold text-slate-600">Period:</span>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-transparent focus:outline-none font-semibold text-slate-800"
          />
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total Entries */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('summary.totalInvoices')}</p>
          <p className="text-2xl font-bold text-slate-800 font-mono">
            {loading ? '...' : totalEntries}
          </p>
        </div>

        {/* Valid Entries */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">{t('summary.cleanEntries')}</p>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-700 font-mono">
            {loading ? '...' : validCount}
          </p>
        </div>

        {/* Warnings */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">{t('summary.warnings')}</p>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-amber-700 font-mono">
            {loading ? '...' : warningCount}
          </p>
        </div>

        {/* Blocking Errors */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">{t('summary.blockingErrors')}</p>
            <AlertOctagon className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-2xl font-bold text-red-700 font-mono">
            {loading ? '...' : blockingCount}
          </p>
        </div>
      </div>

      {/* Compliance / Blocking Status Callout */}
      {hasBlocking ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
          <div className="flex items-start space-x-3">
            <ShieldAlert className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <h3 className="text-sm font-bold text-red-900">
                {t('summary.exportBlockedTitle')}
              </h3>
              <p className="text-xs text-red-800 leading-relaxed">
                {t('summary.exportBlockedDesc', { count: blockingCount })}
              </p>
            </div>
          </div>
          {onNavigateToReview && (
            <div className="pt-1 pl-9">
              <button
                type="button"
                onClick={onNavigateToReview}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
              >
                <span>{t('summary.fixInReview')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex items-start space-x-3">
          <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-emerald-900">
              {t('summary.readyTitle')}
            </h3>
            <p className="text-xs text-emerald-800 leading-relaxed">
              {t('summary.readyDesc', { period })}
            </p>
          </div>
        </div>
      )}

      {/* Export Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
        <div>
          <h2 className="text-base font-bold text-slate-800">{t('summary.generateTitle')}</h2>
          <p className="text-xs text-slate-500">
            {t('summary.generateDesc')}
          </p>
        </div>

        {/* Feedback messages */}
        {exportSuccessMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm rounded-lg flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>{exportSuccessMsg}</span>
          </div>
        )}
        {exportErrorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm rounded-lg flex items-center space-x-2">
            <AlertOctagon className="w-4 h-4 text-red-600" />
            <span>{exportErrorMsg}</span>
          </div>
        )}

        {/* Source image deletion option */}
        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-start space-x-3">
          <input
            type="checkbox"
            id="deleteImages"
            checked={deleteSourceImages}
            onChange={(e) => setDeleteSourceImages(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="deleteImages" className="text-xs text-slate-700 space-y-0.5 cursor-pointer">
            <span className="font-semibold block flex items-center space-x-1">
              <Trash2 className="w-3.5 h-3.5 text-slate-500" />
              <span>{t('summary.deleteImagesLabel')}</span>
            </span>
            <span className="text-slate-500 block">
              {t('summary.deleteImagesDesc')}
            </span>
          </label>
        </div>

        {/* Export Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Excel Export Button */}
          <div className="space-y-1.5">
            <button
              type="button"
              disabled={hasBlocking || totalEntries === 0 || exportingFormat !== null}
              onClick={() => handleExport('xlsx')}
              className={`w-full py-3.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 shadow-sm transition ${
                hasBlocking || totalEntries === 0
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {exportingFormat === 'xlsx' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              <span>{t('summary.downloadExcel')}</span>
            </button>
            {hasBlocking && (
              <p className="text-[11px] text-red-600 text-center font-medium">
                {t('summary.disabledNote', { count: blockingCount })}
              </p>
            )}
          </div>

          {/* JSON Export Button */}
          <div className="space-y-1.5">
            <button
              type="button"
              disabled={hasBlocking || totalEntries === 0 || exportingFormat !== null}
              onClick={() => handleExport('json')}
              className={`w-full py-3.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 shadow-sm transition ${
                hasBlocking || totalEntries === 0
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {exportingFormat === 'json' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileCode className="w-4 h-4" />
              )}
              <span>{t('summary.downloadJson')}</span>
            </button>
            {hasBlocking && (
              <p className="text-[11px] text-red-600 text-center font-medium">
                {t('summary.disabledNote', { count: blockingCount })}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
