import React, { useState, useEffect, useRef } from 'react';
import { EntryReviewed, ValidationFinding } from '../types';
import { useTranslation } from '../i18n/I18nContext';
import en from '../i18n/en.json';
import hi from '../i18n/hi.json';
import {
  Volume2,
  Edit2,
  CheckCircle,
  AlertOctagon,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Save,
  X,
  Sparkles,
} from 'lucide-react';

interface EntryCardProps {
  entry: EntryReviewed;
  findings: ValidationFinding[];
  isExpandedDefault?: boolean;
  onSaveEntry: (updated: Partial<EntryReviewed>) => Promise<void>;
  onMarkReviewed?: () => void;
  onOpenFindingsModal?: () => void;
}

export const EntryCard: React.FC<EntryCardProps> = ({
  entry,
  findings,
  isExpandedDefault = false,
  onSaveEntry,
  onMarkReviewed,
  onOpenFindingsModal,
}) => {
  const { t, language } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(isExpandedDefault);
  const [isEditing, setIsEditing] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Form edit states
  const [partyName, setPartyName] = useState(entry.party_name || '');
  const [partyGstin, setPartyGstin] = useState(entry.party_gstin || '');
  const [invoiceNo, setInvoiceNo] = useState(entry.invoice_no || '');
  const [invoiceDate, setInvoiceDate] = useState(entry.invoice_date || '');
  const [taxableValue, setTaxableValue] = useState<number | string>(
    entry.taxable_value ?? ''
  );
  const [taxRate, setTaxRate] = useState<number | string>(entry.tax_rate ?? '');
  const [total, setTotal] = useState<number | string>(entry.total ?? '');
  const [saving, setSaving] = useState(false);

  // Touch swipe handling
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  // Determine highest severity finding
  const hasBlocking = findings.some((f) => f.severity === 'BLOCKING');
  const hasWarning = findings.some((f) => f.severity === 'WARNING');
  const highestSeverity = hasBlocking
    ? 'BLOCKING'
    : hasWarning
    ? 'WARNING'
    : 'OK';

  const highestFinding = findings.find((f) => f.severity === highestSeverity);

  // Derive secondary language explanation for bilingual display
  const getSecondaryMessage = (finding?: ValidationFinding): string | null => {
    if (!finding || !finding.message_key) return null;
    const otherLang = language === 'hi' ? 'en' : 'hi';
    const otherCatalog = (otherLang === 'hi' ? hi : en) as any;
    let template = otherCatalog.rules?.[finding.message_key] || otherCatalog[finding.message_key];
    if (!template) return null;
    if (finding.message_params) {
      Object.entries(finding.message_params).forEach(([k, v]) => {
        template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }
    return template;
  };

  const secondaryExplanation = getSecondaryMessage(highestFinding);

  // Check speech synthesis availability
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const checkVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        const targetLang = language === 'hi' ? 'hi' : 'en';
        const hasVoice = voices.some((v) =>
          v.lang.toLowerCase().startsWith(targetLang)
        );
        setSpeechAvailable(hasVoice || voices.length > 0);
      };

      checkVoices();
      window.speechSynthesis.onvoiceschanged = checkVoices;
    }
  }, [language]);

  // Read aloud via Web Speech API
  const handleListen = () => {
    if (!speechAvailable || !highestFinding) return;

    window.speechSynthesis.cancel();
    const textToSpeak = highestFinding.message;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.9;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  // Touch gesture listeners
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (distance > minSwipeDistance) {
      // Swipe left -> open edit mode
      setIsEditing(true);
    } else if (distance < -minSwipeDistance) {
      // Swipe right -> mark reviewed
      if (onMarkReviewed) {
        onMarkReviewed();
      }
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  // Handle saving edits
  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveEntry({
        party_name: partyName,
        party_gstin: partyGstin,
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        taxable_value: taxableValue === '' ? null : Number(taxableValue),
        tax_rate: taxRate === '' ? null : Number(taxRate),
        total: total === '' ? null : Number(total),
      });

      setIsEditing(false);
      // Trigger subtle row pulse with --hl-fill (600ms)
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 600);
    } catch (err) {
      console.error('Failed to save card entry:', err);
    } finally {
      setSaving(false);
    }
  };

  // Confidence check helper
  const isLowConf = (field: string) => {
    if (!entry.field_confidence) return false;
    const val = entry.field_confidence[field];
    return typeof val === 'number' && val < 0.85;
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`w-full rounded-xl border transition-all duration-300 shadow-sm overflow-hidden ${
        isPulsing
          ? 'bg-hl-fill border-hl-border'
          : 'bg-surface border-border hover:border-divider'
      }`}
    >
      {/* Top Card Summary Row */}
      <div className="p-3.5 flex items-start justify-between gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-body font-bold text-ink truncate">
              {entry.party_name || (
                <span className="italic text-muted font-normal">
                  {t('review.unnamedParty') || 'Unnamed Party'}
                </span>
              )}
            </span>
            <span className="text-secondary font-mono text-muted">
              {entry.invoice_no || '#—'}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1 text-label text-muted">
            <span>{entry.invoice_date || 'No Date'}</span>
            <span>•</span>
            <span className="font-bold text-ink text-body">
              ₹{(entry.total ?? 0).toLocaleString('en-IN', {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        {/* Severity Badge with visible TEXT Label */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenFindingsModal}
            aria-label={`Validation Status: ${highestSeverity}`}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-label font-bold border transition-colors ${
              highestSeverity === 'BLOCKING'
                ? 'bg-blocking-bg text-blocking-text border-blocking-border'
                : highestSeverity === 'WARNING'
                ? 'bg-warning-bg text-warning-text border-amber-300'
                : 'bg-ok-bg text-ok-text border-emerald-300'
            }`}
          >
            {highestSeverity === 'BLOCKING' && (
              <>
                <AlertOctagon className="w-3.5 h-3.5 stroke-[2]" />
                <span>
                  {findings.length > 0
                    ? `${findings.length} Blocking Error`
                    : 'Blocking'}
                </span>
              </>
            )}
            {highestSeverity === 'WARNING' && (
              <>
                <AlertTriangle className="w-3.5 h-3.5 stroke-[2]" />
                <span>Warning</span>
              </>
            )}
            {highestSeverity === 'OK' && (
              <>
                <CheckCircle className="w-3.5 h-3.5 stroke-[2]" />
                <span>Compliant</span>
              </>
            )}
          </button>

          {/* Toggle Accordion Button */}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-label={isExpanded ? 'Collapse entry' : 'Expand entry'}
            className="p-1 rounded-full hover:bg-ground/60 text-muted transition-colors"
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Details / Inline Editor */}
      {isExpanded && (
        <div className="px-3.5 pb-3.5 pt-1 border-t border-divider/60 space-y-3 bg-ground/25">
          {/* Highest Unresolved Error Callout (Bilingual Explanation) */}
          {highestFinding && !isEditing && (
            <div
              className={`p-3 rounded-lg border text-secondary ${
                highestSeverity === 'BLOCKING'
                  ? 'bg-blocking-bg/60 border-blocking-border text-blocking-text'
                  : 'bg-warning-bg/60 border-amber-300 text-warning-text'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="font-bold text-label uppercase tracking-wider">
                    {highestFinding.rule_id}: {highestFinding.severity}
                  </p>
                  {/* Primary Language Explanation */}
                  <p className="font-semibold leading-snug">
                    {highestFinding.message}
                  </p>
                  {/* Secondary Language Explanation (bilingual display) */}
                  {secondaryExplanation && secondaryExplanation !== highestFinding.message && (
                    <p className="text-xs text-text-2/80 font-normal pt-1 border-t border-divider/40">
                      {secondaryExplanation}
                    </p>
                  )}
                  {/* Action button: Opens editor without silent change */}
                  <div className="pt-1.5">
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-surface border border-border text-ink text-xs font-semibold hover:bg-ground transition shadow-sm"
                    >
                      <Edit2 className="w-3 h-3 text-muted stroke-[2]" />
                      <span>{language === 'hi' ? 'फ़ील्ड सुधारें' : 'Edit field'}</span>
                    </button>
                  </div>
                </div>

                {/* Web Speech API Listen Button */}
                {speechAvailable && (
                  <button
                    type="button"
                    onClick={handleListen}
                    aria-label="Listen to explanation"
                    className={`p-2 rounded-full border border-border bg-surface hover:bg-ground shadow-sm shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center ${
                      isSpeaking ? 'text-primary ring-2 ring-primary' : 'text-ink'
                    }`}
                  >
                    <Volume2 className="w-4 h-4 stroke-[2]" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Inline Edit Mode Form */}
          {isEditing ? (
            <div className="space-y-2.5 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-label text-muted font-semibold mb-0.5">
                    Party Name
                  </label>
                  <input
                    type="text"
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-surface text-secondary focus:border-primary text-ink"
                  />
                </div>
                <div>
                  <label className="block text-label text-muted font-semibold mb-0.5">
                    GSTIN
                  </label>
                  <input
                    type="text"
                    value={partyGstin}
                    onChange={(e) => setPartyGstin(e.target.value.toUpperCase())}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-surface text-secondary focus:border-primary text-ink font-mono"
                  />
                </div>
                <div>
                  <label className="block text-label text-muted font-semibold mb-0.5">
                    Invoice No
                  </label>
                  <input
                    type="text"
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    className={`w-full px-2.5 py-1.5 rounded-lg border bg-surface text-secondary focus:border-primary text-ink ${
                      isLowConf('invoice_no')
                        ? 'bg-amber-100/90 border-amber-400'
                        : 'border-border'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-label text-muted font-semibold mb-0.5">
                    Date
                  </label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-surface text-secondary focus:border-primary text-ink"
                  />
                </div>
                <div>
                  <label className="block text-label text-muted font-semibold mb-0.5">
                    Taxable Value (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={taxableValue}
                    onChange={(e) => setTaxableValue(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-surface text-secondary focus:border-primary text-ink"
                  />
                </div>
                <div>
                  <label className="block text-label text-muted font-semibold mb-0.5">
                    Tax Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-surface text-secondary focus:border-primary text-ink"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-label text-muted font-semibold mb-0.5">
                    Total Amount (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={total}
                    onChange={(e) => setTotal(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-surface text-secondary focus:border-primary text-ink font-bold"
                  />
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 rounded-lg border border-border text-muted hover:text-ink text-secondary font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-white text-secondary font-bold hover:bg-primary-deep transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Saving...' : 'Save & Validate'}</span>
                </button>
              </div>
            </div>
          ) : (
            /* Visible Action Buttons for Non-Gesture Users */
            <div className="flex items-center justify-between pt-1">
              <div className="text-label text-muted flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-muted" />
                <span>Swipe right: Reviewed • left: Edit</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  aria-label="Edit invoice details"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-ground text-ink text-secondary font-semibold transition-colors min-h-[44px]"
                >
                  <Edit2 className="w-3.5 h-3.5 text-muted" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  onClick={onMarkReviewed}
                  aria-label="Mark invoice reviewed"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-ok-text/30 bg-ok-bg text-ok-text hover:bg-emerald-100 text-secondary font-bold transition-colors min-h-[44px]"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Reviewed</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

