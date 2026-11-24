import React, { useState, useEffect } from 'react';
import { EntryReviewed, ValidationFinding, EntryValidationGroup } from '../types';
import { api } from '../api/client';
import { ErrorModal } from '../components/ErrorModal';
import { DemoBanner, RatesBanner } from '../components/StatutoryBanners';
import { SourcePhotoPanel } from '../components/SourcePhotoPanel';
import { ReturnReadinessCard } from '../components/ReturnReadinessCard';
import { EntryCard } from '../components/EntryCard';
import { useTranslation } from '../i18n/I18nContext';
import {
  Table,
  CheckCircle,
  AlertOctagon,
  AlertTriangle,
  Info,
  RefreshCw,
  Save,
  Calendar,
  AlertCircle,
  Download,
  Lock,
  LayoutGrid,
  List,
} from 'lucide-react';

interface ReviewTableProps {
  onNavigateToExport?: () => void;
}

export const ReviewTable: React.FC<ReviewTableProps> = ({
  onNavigateToExport,
}) => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<EntryReviewed[]>([]);
  const [validations, setValidations] = useState<
    Record<number, EntryValidationGroup>
  >({});
  const [loading, setLoading] = useState<boolean>(true);
  const [validating, setValidating] = useState<boolean>(false);
  const [period, setPeriod] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [validationCounts, setValidationCounts] = useState<{
    blocking: number;
    warning: number;
    info: number;
  }>({ blocking: 0, warning: 0, info: 0 });
  const isDesktop = typeof window !== 'undefined' ? window.innerWidth >= 1024 : false;
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(
    isDesktop ? 'table' : 'cards'
  );

  // Editing state for table view: map of entryId -> edited fields
  const [editingRows, setEditingRows] = useState<
    Record<number, Partial<EntryReviewed>>
  >({});
  const [savedRowIds, setSavedRowIds] = useState<Record<number, boolean>>({});
  const [savingRowId, setSavingRowId] = useState<number | null>(null);

  // Modal state
  const [selectedEntryFindings, setSelectedEntryFindings] = useState<{
    invoiceNo?: string | null;
    findings: ValidationFinding[];
  } | null>(null);

  // Banners & Summary state
  const [hasDemoData, setHasDemoData] = useState<boolean>(false);
  const [ratesBannerInfo, setRatesBannerInfo] = useState<{
    version: string;
    verified: boolean;
  } | null>({
    version: '2023-10-01',
    verified: false,
  });

  const loadData = async (filterPeriod?: string) => {
    setLoading(true);
    try {
      const entriesData = await api.entries.list(filterPeriod || undefined);
      setEntries(entriesData);

      // Check if any entries are demo
      const hasDemo = entriesData.some(
        (e: any) =>
          e.is_demo === true ||
          (e.invoice_no && e.invoice_no.toUpperCase().includes('DEMO')) ||
          (e.party_name && e.party_name.toUpperCase().includes('DEMO'))
      );
      setHasDemoData(hasDemo);

      // Run validation to get fresh findings per row
      await runValidation(filterPeriod);
    } catch (err) {
      console.error('Failed to load review table data:', err);
    } finally {
      setLoading(false);
    }
  };

  const runValidation = async (filterPeriod?: string) => {
    setValidating(true);
    try {
      const valRes = await api.validation.validate(filterPeriod || undefined);
      const valMap: Record<number, EntryValidationGroup> = {};
      valRes.entries.forEach((item) => {
        valMap[item.entry_id] = item;
      });
      setValidations(valMap);
      setValidationCounts({
        blocking: valRes.blocking_count,
        warning: valRes.warning_count,
        info: valRes.info_count,
      });

      // Fetch summary for rates info
      const sumRes = await api.validation.summary(filterPeriod || undefined);
      if (sumRes && sumRes.rate_table_version) {
        setRatesBannerInfo({
          version: sumRes.rate_table_version,
          verified: Boolean(sumRes.rates_verified),
        });
      }
    } catch (err) {
      console.error('Validation failed:', err);
    } finally {
      setValidating(false);
    }
  };

  useEffect(() => {
    loadData(period);
  }, [period]);

  const handleCellChange = (
    entryId: number,
    field: keyof EntryReviewed,
    value: any
  ) => {
    setEditingRows((prev) => ({
      ...prev,
      [entryId]: {
        ...prev[entryId],
        [field]: value,
      },
    }));
  };

  const handleSaveRow = async (entry: EntryReviewed) => {
    const edits = editingRows[entry.id];
    if (!edits) return;

    setSavingRowId(entry.id);
    try {
      const payload: any = { ...edits };
      if ('taxable_value' in payload && payload.taxable_value !== undefined) {
        payload.taxable_value = parseFloat(payload.taxable_value) || 0;
      }
      if ('tax_rate' in payload && payload.tax_rate !== undefined) {
        payload.tax_rate = parseFloat(payload.tax_rate) || 0;
      }
      if ('cgst' in payload && payload.cgst !== undefined) {
        payload.cgst = parseFloat(payload.cgst) || 0;
      }
      if ('sgst' in payload && payload.sgst !== undefined) {
        payload.sgst = parseFloat(payload.sgst) || 0;
      }
      if ('igst' in payload && payload.igst !== undefined) {
        payload.igst = parseFloat(payload.igst) || 0;
      }
      if ('total' in payload && payload.total !== undefined) {
        payload.total = parseFloat(payload.total) || 0;
      }

      const updated = await api.entries.update(entry.id, payload);

      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, ...updated } : e))
      );

      setEditingRows((prev) => {
        const next = { ...prev };
        delete next[entry.id];
        return next;
      });

      setSavedRowIds((prev) => ({ ...prev, [entry.id]: true }));
      setTimeout(() => {
        setSavedRowIds((prev) => {
          const next = { ...prev };
          delete next[entry.id];
          return next;
        });
      }, 2000);

      // Re-run validation immediately to reflect new status
      await runValidation(period);
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setSavingRowId(null);
    }
  };

  const handleSaveCardEntry = async (
    entryId: number,
    updatedFields: Partial<EntryReviewed>
  ) => {
    try {
      const updated = await api.entries.update(entryId, updatedFields);
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, ...updated } : e))
      );
      // Re-run validation immediately
      await runValidation(period);
    } catch (err: any) {
      console.error('Failed to update entry:', err);
      throw err;
    }
  };

  const getRowValidationStatus = (entryId: number) => {
    const group = validations[entryId];
    if (!group)
      return {
        badge: 'VALID',
        text: t('review.compliant') || 'Compliant',
        color: 'emerald',
        findings: [],
      };

    const findings = group.results || [];
    const hasBlocking = findings.some((f) => f.severity === 'BLOCKING');
    const hasWarning = findings.some((f) => f.severity === 'WARNING');
    const hasInfo = findings.some((f) => f.severity === 'INFO');

    if (hasBlocking) {
      const count = findings.filter((f) => f.severity === 'BLOCKING').length;
      return {
        badge: 'BLOCKING',
        text:
          count > 1
            ? `${count} Blocking Errors`
            : `${count} Blocking Error`,
        color: 'red',
        findings,
      };
    }
    if (hasWarning) {
      const count = findings.filter((f) => f.severity === 'WARNING').length;
      return {
        badge: 'WARNING',
        text: count > 1 ? `${count} Warnings` : `1 Warning`,
        color: 'amber',
        findings,
      };
    }
    if (hasInfo) {
      const count = findings.filter((f) => f.severity === 'INFO').length;
      return {
        badge: 'INFO',
        text: `Notice (${count})`,
        color: 'blue',
        findings,
      };
    }
    return {
      badge: 'VALID',
      text: t('review.compliant') || 'Compliant',
      color: 'emerald',
      findings: [],
    };
  };

  // Confidence check helper
  const isLowConfidenceField = (
    entry: EntryReviewed,
    field: string
  ): { isLow: boolean; score?: number } => {
    if (!entry.field_confidence) return { isLow: false };
    const conf = entry.field_confidence[field];
    if (conf !== undefined && conf !== null && conf < 0.85) {
      return { isLow: true, score: Math.round(conf * 100) };
    }
    return { isLow: false };
  };

  const hasAnyLowConfidence = entries.some((e) => {
    if (!e.field_confidence) return false;
    return Object.values(e.field_confidence).some(
      (val) => val !== null && val !== undefined && val < 0.85
    );
  });

  // Calculate return readiness metrics
  const totalEntries = entries.length;
  const entriesWithBlocking = entries.filter((e) => {
    const findings = validations[e.id]?.results || [];
    return findings.some((f) => f.severity === 'BLOCKING');
  });
  const blockingCount = entriesWithBlocking.length;
  const entriesWithoutBlocking = totalEntries - blockingCount;

  // Find the entry with highest-severity unresolved error for default accordion expansion
  const highestSeverityEntryId = (() => {
    const blockingEntry = entries.find((e) => {
      const f = validations[e.id]?.results || [];
      return f.some((item) => item.severity === 'BLOCKING');
    });
    if (blockingEntry) return blockingEntry.id;

    const warningEntry = entries.find((e) => {
      const f = validations[e.id]?.results || [];
      return f.some((item) => item.severity === 'WARNING');
    });
    if (warningEntry) return warningEntry.id;

    return entries[0]?.id;
  })();

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Top Banner: Persistent DEMO DATA Banner */}
      <DemoBanner show={hasDemoData} />

      {/* Top Banner: Mandatory "Rates as of" banner */}
      <RatesBanner
        date={ratesBannerInfo?.version}
        verified={ratesBannerInfo?.verified}
      />

      {/* Section 1: Source Photo Panel (Height ~132px on mobile, expandable on tap) */}
      <SourcePhotoPanel
        imageUrl={
          entries.length > 0
            ? '/fixtures/sample_invoice.png'
            : null
        }
      />

      {/* Section 2: Return Readiness Card */}
      <ReturnReadinessCard
        totalEntries={totalEntries}
        entriesWithoutBlocking={entriesWithoutBlocking}
        blockingCount={validationCounts.blocking}
      />

      {/* Low OCR Confidence Callout */}
      {hasAnyLowConfidence && (
        <div
          role="region"
          aria-label="Low Confidence Alert"
          className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between text-amber-900 text-xs shadow-sm"
        >
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>
              <strong>{t('review.uncertainOcr') || 'Uncertain OCR'}:</strong>{' '}
              {t('review.lowConfidenceTooltip', { score: '<85' }) ||
                'Low confidence digits highlighted in amber.'}
            </span>
          </div>
          <span className="hidden sm:inline text-[11px] font-semibold bg-amber-200/80 px-2 py-0.5 rounded text-amber-900">
            Amber Highlights
          </span>
        </div>
      )}

      {/* Header, Filters & View Toggle */}
      <div className="bg-surface rounded-xl shadow-sm border border-border p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="w-full sm:w-auto">
          <h1 className="text-page-title text-ink font-bold">
            {t('review.title') || 'Review Invoices Table'}
          </h1>
          <p className="hidden sm:block text-secondary text-muted">
            {t('review.subtitle') ||
              'Review and verify extracted ledger line items.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          {/* Period Filter */}
          <div className="flex items-center gap-1.5 bg-ground/60 border border-border rounded-lg px-2.5 py-1.5 text-secondary text-ink shrink-0">
            <Calendar className="w-4 h-4 text-muted" />
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-transparent focus:outline-none text-secondary font-medium"
              placeholder={t('review.allPeriods') || 'All periods'}
            />
            {period && (
              <button
                type="button"
                onClick={() => setPeriod('')}
                className="text-muted hover:text-ink text-label ml-1"
              >
                {t('review.clear') || 'Clear'}
              </button>
            )}
          </div>

          {/* Re-run Validation Button */}
          <button
            type="button"
            onClick={() => runValidation(period)}
            disabled={validating}
            aria-label="Revalidate entries"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-ground/60 text-ink border border-border font-semibold rounded-lg text-secondary transition-colors disabled:opacity-50 min-h-[40px] shrink-0"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${validating ? 'animate-spin' : ''}`}
            />
            <span>
              {validating
                ? t('review.validating') || 'Validating...'
                : t('review.revalidate') || 'Revalidate'}
            </span>
          </button>

          {/* View Toggle (Cards vs Table) */}
          <div className="flex border border-border rounded-lg overflow-hidden bg-ground/40 shrink-0 ml-auto sm:ml-0">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              aria-label="Card View"
              className={`p-2 transition-colors ${
                viewMode === 'cards'
                  ? 'bg-nav-pill-bg text-nav-pill-text font-bold'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              aria-label="Table View"
              className={`p-2 transition-colors ${
                viewMode === 'table'
                  ? 'bg-nav-pill-bg text-nav-pill-text font-bold'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Entries View: Cards (Mobile-First) or Full Table */}
      {loading ? (
        <div className="p-12 text-center text-muted bg-surface rounded-xl border border-border">
          {t('review.loading') || 'Loading entries...'}
        </div>
      ) : entries.length === 0 ? (
        <div className="p-12 text-center text-muted bg-surface rounded-xl border border-border">
          {t('review.noEntries') || 'No entries found. Scan an invoice to start.'}
        </div>
      ) : viewMode === 'cards' ? (
        /* Vertical Cards View (Mobile-First per UI_SPEC.md) */
        <div className="space-y-3">
          {entries.map((entry) => {
            const findings = validations[entry.id]?.results || [];
            const isHighest = entry.id === highestSeverityEntryId;

            return (
              <EntryCard
                key={entry.id}
                entry={entry}
                findings={findings}
                isExpandedDefault={isHighest}
                onSaveEntry={(updated) =>
                  handleSaveCardEntry(entry.id, updated)
                }
                onMarkReviewed={() => {
                  // Mark as reviewed
                  setSavedRowIds((prev) => ({ ...prev, [entry.id]: true }));
                  setTimeout(() => {
                    setSavedRowIds((prev) => {
                      const next = { ...prev };
                      delete next[entry.id];
                      return next;
                    });
                  }, 1500);
                }}
                onOpenFindingsModal={() =>
                  setSelectedEntryFindings({
                    invoiceNo: entry.invoice_no,
                    findings,
                  })
                }
              />
            );
          })}
        </div>
      ) : (
        /* Full Table View (Desktop 1024px+ / Power Users) */
        <div className="bg-surface rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-secondary border-collapse">
              <thead>
                <tr className="bg-ground/40 text-muted font-semibold border-b border-border uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">{t('review.status') || 'Status'}</th>
                  <th className="py-2.5 px-3">{t('review.type') || 'Type'}</th>
                  <th className="py-2.5 px-3">{t('review.invNo') || 'Invoice No'}</th>
                  <th className="py-2.5 px-3">{t('review.date') || 'Date'}</th>
                  <th className="py-2.5 px-3">{t('review.partyName') || 'Party'}</th>
                  <th className="py-2.5 px-3">{t('review.gstin') || 'GSTIN'}</th>
                  <th className="py-2.5 px-3">{t('review.hsn') || 'HSN'}</th>
                  <th className="py-2.5 px-3 text-right">
                    {t('review.taxable') || 'Taxable'}
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    {t('review.cgst') || 'CGST'}
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    {t('review.sgst') || 'SGST'}
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    {t('review.igst') || 'IGST'}
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    {t('review.total') || 'Total'}
                  </th>
                  <th className="py-2.5 px-3 text-center">
                    {t('review.actions') || 'Actions'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-mono">
                {entries.map((entry) => {
                  const status = getRowValidationStatus(entry.id);
                  const isEdited = Boolean(editingRows[entry.id]);
                  const rowValues: any = {
                    ...entry,
                    ...(editingRows[entry.id] || {}),
                  };
                  const isSaving = savingRowId === entry.id;

                  const confInvNo = isLowConfidenceField(entry, 'invoice_no');
                  const confDate = isLowConfidenceField(entry, 'invoice_date');
                  const confParty = isLowConfidenceField(entry, 'party_name');
                  const confGstin = isLowConfidenceField(entry, 'party_gstin');
                  const confHsn = isLowConfidenceField(entry, 'hsn_or_category');
                  const confTaxable = isLowConfidenceField(entry, 'taxable_value');
                  const confTotal = isLowConfidenceField(entry, 'total');

                  const getConfidenceInputClass = (conf: {
                    isLow: boolean;
                    score?: number;
                  }) => {
                    if (conf.isLow) {
                      return 'bg-amber-100/90 border-amber-400 text-amber-950 font-semibold ring-1 ring-amber-300';
                    }
                    return 'bg-transparent hover:bg-surface focus:bg-surface border-transparent focus:border-primary text-ink';
                  };

                  return (
                    <tr
                      key={entry.id}
                      className={`hover:bg-ground/30 transition-colors ${
                        status.badge === 'BLOCKING' ? 'bg-blocking-bg/30' : ''
                      }`}
                    >
                      {/* Validation Badge */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedEntryFindings({
                              invoiceNo: rowValues.invoice_no,
                              findings: status.findings,
                            })
                          }
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-label font-sans font-bold border transition-colors ${
                            status.color === 'red'
                              ? 'bg-blocking-bg text-blocking-text border-blocking-border hover:bg-red-200'
                              : status.color === 'amber'
                              ? 'bg-warning-bg text-warning-text border-amber-300 hover:bg-amber-200'
                              : 'bg-ok-bg text-ok-text border-emerald-300 hover:bg-emerald-200'
                          }`}
                        >
                          {status.badge === 'BLOCKING' && (
                            <AlertOctagon className="w-3 h-3 text-blocking-text" />
                          )}
                          {status.badge === 'WARNING' && (
                            <AlertTriangle className="w-3 h-3 text-warning-text" />
                          )}
                          {status.badge === 'VALID' && (
                            <CheckCircle className="w-3 h-3 text-ok-text" />
                          )}
                          <span>{status.text}</span>
                        </button>
                      </td>

                      {/* Entry Type */}
                      <td className="py-2 px-3 whitespace-nowrap font-sans">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            rowValues.entry_type === 'PURCHASE'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {rowValues.entry_type}
                        </span>
                      </td>

                      {/* Invoice No */}
                      <td className="py-2 px-2 whitespace-nowrap">
                        <input
                          type="text"
                          value={rowValues.invoice_no || ''}
                          title={
                            confInvNo.isLow
                              ? `Low OCR confidence (${confInvNo.score}%)`
                              : ''
                          }
                          onChange={(e) =>
                            handleCellChange(entry.id, 'invoice_no', e.target.value)
                          }
                          className={`px-1.5 py-0.5 rounded border text-secondary ${getConfidenceInputClass(
                            confInvNo
                          )}`}
                        />
                      </td>

                      {/* Date */}
                      <td className="py-2 px-2 whitespace-nowrap">
                        <input
                          type="date"
                          value={rowValues.invoice_date || ''}
                          title={
                            confDate.isLow
                              ? `Low OCR confidence (${confDate.score}%)`
                              : ''
                          }
                          onChange={(e) =>
                            handleCellChange(
                              entry.id,
                              'invoice_date',
                              e.target.value
                            )
                          }
                          className={`px-1.5 py-0.5 rounded border text-secondary ${getConfidenceInputClass(
                            confDate
                          )}`}
                        />
                      </td>

                      {/* Party Name */}
                      <td className="py-2 px-2 whitespace-nowrap font-sans">
                        <input
                          type="text"
                          value={rowValues.party_name || ''}
                          title={
                            confParty.isLow
                              ? `Low OCR confidence (${confParty.score}%)`
                              : ''
                          }
                          onChange={(e) =>
                            handleCellChange(
                              entry.id,
                              'party_name',
                              e.target.value
                            )
                          }
                          className={`px-1.5 py-0.5 rounded border text-secondary max-w-[120px] ${getConfidenceInputClass(
                            confParty
                          )}`}
                        />
                      </td>

                      {/* GSTIN */}
                      <td className="py-2 px-2 whitespace-nowrap">
                        <input
                          type="text"
                          value={rowValues.party_gstin || ''}
                          title={
                            confGstin.isLow
                              ? `Low OCR confidence (${confGstin.score}%)`
                              : ''
                          }
                          onChange={(e) =>
                            handleCellChange(
                              entry.id,
                              'party_gstin',
                              e.target.value.toUpperCase()
                            )
                          }
                          className={`px-1.5 py-0.5 rounded border text-secondary max-w-[140px] uppercase ${getConfidenceInputClass(
                            confGstin
                          )}`}
                        />
                      </td>

                      {/* HSN */}
                      <td className="py-2 px-2 whitespace-nowrap">
                        <input
                          type="text"
                          value={rowValues.hsn_or_category || ''}
                          title={
                            confHsn.isLow
                              ? `Low OCR confidence (${confHsn.score}%)`
                              : ''
                          }
                          onChange={(e) =>
                            handleCellChange(
                              entry.id,
                              'hsn_or_category',
                              e.target.value
                            )
                          }
                          className={`px-1.5 py-0.5 rounded border text-secondary max-w-[70px] ${getConfidenceInputClass(
                            confHsn
                          )}`}
                        />
                      </td>

                      {/* Taxable Value */}
                      <td className="py-2 px-2 text-right whitespace-nowrap">
                        <input
                          type="number"
                          step="0.01"
                          value={
                            rowValues.taxable_value !== null &&
                            rowValues.taxable_value !== undefined
                              ? rowValues.taxable_value
                              : ''
                          }
                          title={
                            confTaxable.isLow
                              ? `Low OCR confidence (${confTaxable.score}%)`
                              : ''
                          }
                          onChange={(e) =>
                            handleCellChange(
                              entry.id,
                              'taxable_value',
                              e.target.value
                            )
                          }
                          className={`px-1.5 py-0.5 rounded border text-secondary text-right max-w-[90px] ${getConfidenceInputClass(
                            confTaxable
                          )}`}
                        />
                      </td>

                      {/* CGST */}
                      <td className="py-2 px-2 text-right whitespace-nowrap">
                        <input
                          type="number"
                          step="0.01"
                          value={
                            rowValues.cgst !== null && rowValues.cgst !== undefined
                              ? rowValues.cgst
                              : ''
                          }
                          onChange={(e) =>
                            handleCellChange(entry.id, 'cgst', e.target.value)
                          }
                          className="px-1.5 py-0.5 rounded border border-transparent hover:bg-surface focus:bg-surface focus:border-primary text-secondary text-right max-w-[70px] text-ink"
                        />
                      </td>

                      {/* SGST */}
                      <td className="py-2 px-2 text-right whitespace-nowrap">
                        <input
                          type="number"
                          step="0.01"
                          value={
                            rowValues.sgst !== null && rowValues.sgst !== undefined
                              ? rowValues.sgst
                              : ''
                          }
                          onChange={(e) =>
                            handleCellChange(entry.id, 'sgst', e.target.value)
                          }
                          className="px-1.5 py-0.5 rounded border border-transparent hover:bg-surface focus:bg-surface focus:border-primary text-secondary text-right max-w-[70px] text-ink"
                        />
                      </td>

                      {/* IGST */}
                      <td className="py-2 px-2 text-right whitespace-nowrap">
                        <input
                          type="number"
                          step="0.01"
                          value={
                            rowValues.igst !== null && rowValues.igst !== undefined
                              ? rowValues.igst
                              : ''
                          }
                          onChange={(e) =>
                            handleCellChange(entry.id, 'igst', e.target.value)
                          }
                          className="px-1.5 py-0.5 rounded border border-transparent hover:bg-surface focus:bg-surface focus:border-primary text-secondary text-right max-w-[70px] text-ink"
                        />
                      </td>

                      {/* Total */}
                      <td className="py-2 px-2 text-right whitespace-nowrap font-bold">
                        <input
                          type="number"
                          step="0.01"
                          value={
                            rowValues.total !== null &&
                            rowValues.total !== undefined
                              ? rowValues.total
                              : ''
                          }
                          title={
                            confTotal.isLow
                              ? `Low OCR confidence (${confTotal.score}%)`
                              : ''
                          }
                          onChange={(e) =>
                            handleCellChange(entry.id, 'total', e.target.value)
                          }
                          className={`px-1.5 py-0.5 rounded border text-secondary text-right max-w-[95px] font-bold ${getConfidenceInputClass(
                            confTotal
                          )}`}
                        />
                      </td>

                      {/* Row Action (Save) */}
                      <td className="py-2 px-3 text-center whitespace-nowrap font-sans">
                        {isEdited && (
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleSaveRow(entry)}
                            aria-label="Save changes"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary text-white text-[11px] font-bold rounded shadow hover:bg-primary-deep transition-colors"
                          >
                            <Save className="w-3 h-3" />
                            <span>{isSaving ? '...' : 'Save'}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 6: Primary Action: Export Button (Disabled if any blocking error exists) */}
      <div className="sticky bottom-20 z-20 pt-2">
        <button
          type="button"
          disabled={blockingCount > 0}
          onClick={() => {
            if (onNavigateToExport) {
              onNavigateToExport();
            }
          }}
          className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-body font-bold transition-all shadow-md min-h-[48px] ${
            blockingCount > 0
              ? 'bg-disabled-bg text-disabled-text cursor-not-allowed border border-border'
              : 'bg-primary text-white hover:bg-primary-deep cursor-pointer'
          }`}
        >
          {blockingCount > 0 ? (
            <>
              <Lock className="w-4 h-4 stroke-[2]" />
              <span>Export locked: {blockingCount} blocking error(s)</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4 stroke-[2]" />
              <span>Export {period || 'All Entries'} (.xlsx / .json)</span>
            </>
          )}
        </button>
      </div>

      {/* Error / Findings Modal Drawer */}
      <ErrorModal
        isOpen={Boolean(selectedEntryFindings)}
        onClose={() => setSelectedEntryFindings(null)}
        invoiceNo={selectedEntryFindings?.invoiceNo}
        findings={selectedEntryFindings?.findings || []}
      />
    </div>
  );
};
