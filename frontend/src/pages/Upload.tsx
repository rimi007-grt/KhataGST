import React, { useState, useRef } from 'react';
import { DocType, EntryCreate } from '../types';
import { api } from '../api/client';
import { RatesBanner } from '../components/StatutoryBanners';
import { useTranslation } from '../i18n/I18nContext';
import {
  Camera,
  Image as ImageIcon,
  FileText,
  AlertCircle,
  CheckCircle,
  Plus,
  X,
  ArrowRight,
  Sparkles,
  Edit3,
} from 'lucide-react';

interface PageItem {
  id: string;
  file: File;
  previewUrl: string;
  qualityHint?: string | null;
}

interface UploadProps {
  onNavigateToReview?: () => void;
}

export const Upload: React.FC<UploadProps> = ({ onNavigateToReview }) => {
  const { t } = useTranslation();
  const [docType, setDocType] = useState<DocType>('SALES');
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);

  // Statuses: 'IDLE' | 'UPLOADING' | 'EXTRACTING' | 'SUCCESS' | 'FAILED' | 'PARTIAL'
  const [status, setStatus] = useState<string>('IDLE');
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [extractedCount, setExtractedCount] = useState<number>(0);

  // Manual fallback state
  const [showManualForm, setShowManualForm] = useState<boolean>(false);
  const [manualSaving, setManualSaving] = useState<boolean>(false);
  const [manualSavedMsg, setManualSavedMsg] = useState<string | null>(null);

  // Manual entry fields
  const [manualEntry, setManualEntry] = useState<EntryCreate>({
    entry_type: 'SALES',
    invoice_no: '',
    invoice_date: new Date().toISOString().slice(0, 10),
    party_name: '',
    party_gstin: '',
    hsn_or_category: '',
    description: '',
    taxable_value: undefined,
    tax_rate: 18,
    cgst: undefined,
    sgst: undefined,
    igst: undefined,
    total: undefined,
    source: 'MANUAL',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const addPageInputRef = useRef<HTMLInputElement>(null);

  // Client-side quality check: Laplacian variance & brightness on downscaled 100x100 canvas
  const checkImageQuality = (file: File): Promise<string | null> => {
    return new Promise((resolve) => {
      try {
        if (!file.type.startsWith('image/')) {
          return resolve(null);
        }
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const size = 100;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              URL.revokeObjectURL(objectUrl);
              return resolve(null);
            }
            ctx.drawImage(img, 0, 0, size, size);
            const imgData = ctx.getImageData(0, 0, size, size);
            const data = imgData.data;

            // Grayscale & average brightness
            const gray = new Float32Array(size * size);
            let sumBrightness = 0;
            for (let i = 0; i < data.length; i += 4) {
              const val =
                0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              gray[i / 4] = val;
              sumBrightness += val;
            }
            const avgBrightness = sumBrightness / (size * size);

            // Laplacian kernel convolution variance
            let lapSum = 0;
            let lapSqSum = 0;
            let count = 0;
            for (let y = 1; y < size - 1; y++) {
              for (let x = 1; x < size - 1; x++) {
                const idx = y * size + x;
                const lap =
                  gray[idx - 1] +
                  gray[idx + 1] +
                  gray[idx - size] +
                  gray[idx + size] -
                  4 * gray[idx];
                lapSum += lap;
                lapSqSum += lap * lap;
                count++;
              }
            }
            const mean = lapSum / count;
            const variance = lapSqSum / count - mean * mean;

            URL.revokeObjectURL(objectUrl);

            if (avgBrightness < 35 && variance < 60) {
              resolve(
                'Hint: Photo appears dark and may be blurry. For best results, use good lighting.'
              );
            } else if (avgBrightness < 35) {
              resolve('Hint: Photo appears dark. Try capturing in better light.');
            } else if (variance < 60) {
              resolve('Hint: Photo may be blurry. Hold camera steady.');
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = objectUrl;
      } catch {
        resolve(null);
      }
    });
  };

  const handleAddFiles = (fileList: any) => {
    const filesArray: File[] = fileList ? Array.from(fileList) : [];
    if (filesArray.length === 0) return;

    setFile(filesArray[0]);

    const newPages: PageItem[] = filesArray.map((f, i) => {
      let objectUrl = '';
      try {
        if (typeof URL !== 'undefined' && URL.createObjectURL) {
          objectUrl = URL.createObjectURL(f);
        }
      } catch {
        objectUrl = '';
      }

      return {
        id: `${Date.now()}-${i}-${f.name}`,
        file: f,
        previewUrl: objectUrl,
        qualityHint: null,
      };
    });

    setPages((prev) => [...prev, ...newPages]);
    setStatus('IDLE');
    setErrorMessage(null);
    setShowManualForm(false);

    // Run quality check asynchronously in background
    if (filesArray[0]) {
      checkImageQuality(filesArray[0]).then((hint) => {
        if (hint) {
          setPages((prev) =>
            prev.map((p, idx) => (idx === 0 ? { ...p, qualityHint: hint } : p))
          );
        }
      });
    }
  };

  const handleRemovePage = (id: string) => {
    setPages((prev) => {
      const removed = prev.find((p) => p.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return prev.filter((p) => p.id !== id);
    });
  };

  const calculateTaxes = (
    taxable: number,
    rate: number,
    isInterstate: boolean
  ) => {
    if (isNaN(taxable) || isNaN(rate)) return;
    const taxTotal = (taxable * rate) / 100;
    if (isInterstate) {
      setManualEntry((prev) => ({
        ...prev,
        taxable_value: taxable,
        tax_rate: rate,
        cgst: 0,
        sgst: 0,
        igst: Number(taxTotal.toFixed(2)),
        total: Number((taxable + taxTotal).toFixed(2)),
      }));
    } else {
      const halfTax = taxTotal / 2;
      setManualEntry((prev) => ({
        ...prev,
        taxable_value: taxable,
        tax_rate: rate,
        cgst: Number(halfTax.toFixed(2)),
        sgst: Number(halfTax.toFixed(2)),
        igst: 0,
        total: Number((taxable + taxTotal).toFixed(2)),
      }));
    }
  };

  const handleProcessDocument = async () => {
    const targetFile = file || (pages.length > 0 ? pages[0].file : null);
    if (!targetFile) {
      setErrorMessage(t('upload.fallbackNotice') || 'Please select a document.');
      return;
    }

    try {
      setStatus('UPLOADING');
      setProgressMsg(t('upload.uploading') || 'Uploading document securely...');
      setErrorMessage(null);
      setUploadProgress(40);

      // 1. Upload document
      const doc = await api.documents.upload(targetFile, docType);
      setUploadProgress(100);

      // 2. Trigger Extraction with Skeleton Rows (no spinners!)
      setStatus('EXTRACTING');
      setProgressMsg(
        t('upload.extracting') || 'Extracting ledger entries with deterministic OCR...'
      );

      const result = await api.documents.extract(doc.id);

      if (result.status === 'OK' && result.entries && result.entries.length > 0) {
        setStatus('SUCCESS');
        setExtractedCount(result.entries.length);

        // Auto promote extracted entries to entries_reviewed so they appear in review table
        for (const item of result.entries) {
          try {
            await api.entries.create({
              extracted_entry_id: item.id,
              source: 'EXTRACTED_EDITED',
              entry_type: docType === 'PURCHASE' ? 'PURCHASE' : 'SALES',
              invoice_no: item.invoice_no,
              invoice_date: item.invoice_date,
              party_name: item.party_name,
              party_gstin: item.party_gstin,
              hsn_or_category: item.hsn_or_category,
              description: item.description,
              taxable_value: item.taxable_value,
              tax_rate: item.tax_rate,
              cgst: item.cgst,
              sgst: item.sgst,
              igst: item.igst,
              total: item.total,
            });
          } catch (createErr) {
            console.warn('Auto promotion warning for entry:', createErr);
          }
        }
      } else {
        // Fallback condition: status is FAILED or PARTIAL or empty entries
        setStatus(result.status || 'FAILED');
        setErrorMessage(
          result.page_notes ||
            t('upload.fallbackNotice') ||
            'Automatic fallback triggered: You can fill in the invoice details below.'
        );
        setShowManualForm(true);
      }
    } catch (err: any) {
      console.error('Extraction error:', err);
      setStatus('FAILED');
      setErrorMessage(
        err.message ||
          t('upload.fallbackNotice') ||
          'Automatic fallback triggered: You can fill in the invoice details below.'
      );
      setShowManualForm(true);
    }
  };

  const handleSaveManualEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualSaving(true);
    setManualSavedMsg(null);

    try {
      await api.entries.create({
        ...manualEntry,
        taxable_value: manualEntry.taxable_value
          ? Number(manualEntry.taxable_value)
          : null,
        tax_rate: manualEntry.tax_rate ? Number(manualEntry.tax_rate) : null,
        cgst: manualEntry.cgst ? Number(manualEntry.cgst) : 0,
        sgst: manualEntry.sgst ? Number(manualEntry.sgst) : 0,
        igst: manualEntry.igst ? Number(manualEntry.igst) : 0,
        total: manualEntry.total ? Number(manualEntry.total) : null,
        source: 'MANUAL',
      });

      setManualSavedMsg(
        t('upload.manualSaved') || 'Entry saved successfully to Review Table!'
      );
      // Reset form
      setManualEntry({
        entry_type: docType === 'PURCHASE' ? 'PURCHASE' : 'SALES',
        invoice_no: '',
        invoice_date: new Date().toISOString().slice(0, 10),
        party_name: '',
        party_gstin: '',
        hsn_or_category: '',
        description: '',
        taxable_value: undefined,
        tax_rate: 18,
        cgst: undefined,
        sgst: undefined,
        igst: undefined,
        total: undefined,
        source: 'MANUAL',
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save manual entry');
    } finally {
      setManualSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      {/* Hidden File & Camera Inputs */}
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        onChange={(e) => handleAddFiles(e.target.files)}
        className="hidden"
      />
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*,.pdf"
        onChange={(e) => handleAddFiles(e.target.files)}
        className="hidden"
      />
      <input
        type="file"
        ref={addPageInputRef}
        accept="image/*,.pdf"
        multiple
        onChange={(e) => handleAddFiles(e.target.files)}
        className="hidden"
      />

      {/* Mandatory Statutory Rates Banner */}
      <RatesBanner />

      {/* Main Container */}
      <div className="bg-surface rounded-xl shadow-sm border border-border p-4 space-y-4">
        {/* Title Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-page-title text-ink font-bold">
              {t('upload.title') || 'Upload Invoices'}
            </h1>
            <p className="text-secondary text-muted">
              {t('upload.subtitle') ||
                'Capture photo or choose file for assisted extraction'}
            </p>
          </div>
        </div>

        {/* 3-Segment Document Type Selector */}
        <div className="space-y-1.5">
          <label className="block text-label font-bold text-muted uppercase tracking-wider">
            {t('upload.docType') || 'Document Type'}
          </label>
          <div className="grid grid-cols-3 gap-1 p-1 bg-ground/60 border border-border rounded-xl">
            {(
              [
                { id: 'SALES', label: t('upload.sales') || 'Sales (Outward)' },
                {
                  id: 'PURCHASE',
                  label: t('upload.purchase') || 'Purchase (ITC)',
                },
                {
                  id: 'REGISTER_PAGE',
                  label: t('upload.registerPage') || 'Register Page',
                },
              ] as const
            ).map((item) => {
              const active = docType === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDocType(item.id)}
                  aria-pressed={active}
                  className={`py-2 px-2 text-center rounded-lg text-secondary font-semibold transition-all ${
                    active
                      ? 'bg-blue-50 bg-nav-pill-bg text-nav-pill-text shadow-sm'
                      : 'text-muted hover:text-ink hover:bg-surface/50'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Multi-Page Thumbnails Strip (or Empty State) */}
        {pages.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-secondary">
              <span className="font-semibold text-ink">
                {pages.length} page(s) selected
              </span>
              <button
                type="button"
                onClick={() => addPageInputRef.current?.click()}
                className="inline-flex items-center gap-1 text-primary hover:text-primary-deep text-secondary font-bold"
              >
                <Plus className="w-4 h-4" />
                <span>Add another page</span>
              </button>
            </div>

            {/* Thumbnail horizontal scroll strip */}
            <div className="flex items-center gap-2.5 overflow-x-auto pb-2 pt-1">
              {pages.map((p, idx) => (
                <div
                  key={p.id}
                  className="relative shrink-0 w-24 h-32 rounded-lg border border-border overflow-hidden bg-photo-paper shadow-sm group"
                >
                  <img
                    src={p.previewUrl}
                    alt={`Page ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[10px] bg-ink/75 text-white font-medium">
                    P{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemovePage(p.id)}
                    aria-label={`Remove page ${idx + 1}`}
                    className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {/* Add page slot button */}
              <button
                type="button"
                onClick={() => addPageInputRef.current?.click()}
                aria-label="Add page"
                className="shrink-0 w-24 h-32 rounded-lg border-2 border-dashed border-border hover:border-primary flex flex-col items-center justify-center gap-1 text-muted hover:text-primary transition-colors bg-surface/50"
              >
                <Plus className="w-5 h-5" />
                <span className="text-label font-semibold">Add page</span>
              </button>
            </div>

            {/* Friendly Quality Check Hints (Amber-free text per spec) */}
            {pages.some((p) => p.qualityHint) && (
              <div className="p-2.5 bg-ground/60 border border-border rounded-lg flex items-center gap-2 text-secondary text-muted">
                <Sparkles className="w-4 h-4 text-primary shrink-0" />
                <span>
                  {pages.find((p) => p.qualityHint)?.qualityHint ||
                    'Hint: Ensure steady camera and bright lighting.'}
                </span>
              </div>
            )}
          </div>
        ) : (
          /* Friendly Empty State with Inline SVG Illustration */
          <div className="p-6 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-center space-y-3 bg-ground/25">
            <svg
              className="w-16 h-16 text-muted"
              viewBox="0 0 64 64"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="14" y="8" width="36" height="48" rx="4" fill="var(--surface)" />
              <line x1="22" y1="20" x2="42" y2="20" />
              <line x1="22" y1="28" x2="42" y2="28" />
              <line x1="22" y1="36" x2="34" y2="36" />
              <path d="M40 44 L44 48 L52 40" stroke="var(--primary)" strokeWidth="2" />
            </svg>
            <div className="space-y-0.5">
              <p className="text-body font-bold text-ink">
                No document chosen yet
              </p>
              <p className="text-secondary text-muted max-w-xs">
                Take a photo of your paper bill or register page, or upload an image.
              </p>
            </div>
          </div>
        )}

        {/* 3 Core Action Controls: Camera, Gallery, Manual */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          {/* 1. Large Camera Button (capture="environment") */}
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-primary text-white text-secondary font-bold hover:bg-primary-deep transition-all shadow-sm min-h-[48px]"
          >
            <Camera className="w-5 h-5 stroke-[2]" />
            <span>Camera Photo</span>
          </button>

          {/* 2. Choose from Gallery */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl border border-border bg-surface hover:bg-ground/60 text-ink text-secondary font-semibold transition-all min-h-[48px]"
          >
            <ImageIcon className="w-5 h-5 text-muted stroke-[1.75]" />
            <span>Select File</span>
          </button>

          {/* 3. Enter Manually */}
          <button
            type="button"
            onClick={() => setShowManualForm(true)}
            className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl border border-border bg-surface hover:bg-ground/60 text-text-2 text-secondary font-semibold transition-all min-h-[48px]"
          >
            <Edit3 className="w-4 h-4 text-muted stroke-[1.75]" />
            <span>Enter manually</span>
          </button>
        </div>

        {/* Upload Progress Bar */}
        {status === 'UPLOADING' && (
          <div className="space-y-1.5 pt-2 animate-in fade-in">
            <div className="flex justify-between text-secondary text-muted">
              <span>{progressMsg}</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full bg-ground rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Extraction State with Skeleton Rows (NO SPINNERS per spec) */}
        {status === 'EXTRACTING' && (
          <div className="space-y-3 pt-2 p-4 bg-ground/30 rounded-xl border border-border animate-in fade-in">
            <div className="flex items-center gap-2 text-secondary text-ink font-semibold">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              <span>{progressMsg}</span>
            </div>

            {/* Skeleton Rows mimicking line item extraction */}
            <div className="space-y-2">
              <div className="h-6 bg-border/40 rounded animate-pulse w-full" />
              <div className="h-6 bg-border/30 rounded animate-pulse w-5/6" />
              <div className="h-6 bg-border/40 rounded animate-pulse w-4/6" />
              <div className="h-6 bg-border/30 rounded animate-pulse w-full" />
            </div>
          </div>
        )}

        {/* Primary Action Button: Upload & Extract */}
        {status !== 'EXTRACTING' && status !== 'UPLOADING' && (
          <button
            type="button"
            onClick={handleProcessDocument}
            disabled={!file && pages.length === 0}
            className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-body font-bold transition-all shadow-sm min-h-[48px] ${
              file || pages.length > 0
                ? 'bg-primary text-white hover:bg-primary-deep cursor-pointer'
                : 'bg-disabled-bg text-disabled-text cursor-not-allowed border border-border'
            }`}
          >
            <FileText className="w-4 h-4 stroke-[2]" />
            <span>Upload & Extract Entries</span>
          </button>
        )}

        {/* Error / Fallback Alert Notification */}
        {errorMessage && (
          <div className="p-3 bg-blocking-bg text-blocking-text border border-blocking-border rounded-xl text-secondary flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="font-semibold">{errorMessage}</p>
              <p className="text-label">
                Automatic fallback triggered: You can fill in the invoice details below.
              </p>
            </div>
          </div>
        )}

        {/* Success Message Banner */}
        {status === 'SUCCESS' && (
          <div className="p-4 bg-ok-bg text-ok-text border border-emerald-300 rounded-xl flex items-center justify-between text-secondary">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>{`Successfully extracted and saved ${extractedCount} entry(ies)!`}</span>
            </div>
            {onNavigateToReview && (
              <button
                type="button"
                onClick={onNavigateToReview}
                className="flex items-center gap-1 font-bold underline hover:opacity-80"
              >
                <span>Go to Review</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Manual Entry Fallback Form */}
      {showManualForm && (
        <div className="bg-surface rounded-xl shadow-sm border border-border p-4 space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="text-body font-bold text-ink">
                Manual Invoice Entry
              </h2>
              <p className="text-label text-muted">
                Add entries directly into the review ledger.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowManualForm(false)}
              className="text-muted hover:text-ink p-1 rounded-full"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {manualSavedMsg && (
            <div className="p-3 bg-ok-bg text-ok-text rounded-lg text-secondary flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{manualSavedMsg}</span>
            </div>
          )}

          <form onSubmit={handleSaveManualEntry} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-label text-muted font-bold mb-1">
                  Invoice No *
                </label>
                <input
                  type="text"
                  required
                  placeholder="INV-001"
                  value={manualEntry.invoice_no}
                  onChange={(e) =>
                    setManualEntry({ ...manualEntry, invoice_no: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-secondary text-ink focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-label text-muted font-bold mb-1">
                  Invoice Date *
                </label>
                <input
                  type="date"
                  required
                  value={manualEntry.invoice_date}
                  onChange={(e) =>
                    setManualEntry({
                      ...manualEntry,
                      invoice_date: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-secondary text-ink focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-label text-muted font-bold mb-1">
                  Party Name
                </label>
                <input
                  type="text"
                  placeholder="Gupta Kirana Store"
                  value={manualEntry.party_name}
                  onChange={(e) =>
                    setManualEntry({ ...manualEntry, party_name: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-secondary text-ink focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-label text-muted font-bold mb-1">
                  Party GSTIN
                </label>
                <input
                  type="text"
                  placeholder="07AAAAA0000A1Z5"
                  value={manualEntry.party_gstin}
                  onChange={(e) =>
                    setManualEntry({
                      ...manualEntry,
                      party_gstin: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-secondary text-ink focus:border-primary font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-label text-muted font-bold mb-1">
                  Taxable Value (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="1000.00"
                  value={manualEntry.taxable_value ?? ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    calculateTaxes(val, Number(manualEntry.tax_rate || 18), false);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-secondary text-ink focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-label text-muted font-bold mb-1">
                  Tax Rate (%) *
                </label>
                <select
                  value={manualEntry.tax_rate ?? 18}
                  onChange={(e) => {
                    const r = parseFloat(e.target.value);
                    calculateTaxes(
                      Number(manualEntry.taxable_value || 0),
                      r,
                      false
                    );
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-secondary text-ink focus:border-primary"
                >
                  <option value={0}>0%</option>
                  <option value={5}>5%</option>
                  <option value={12}>12%</option>
                  <option value={18}>18%</option>
                  <option value={28}>28%</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-label text-muted font-bold mb-1">
                  Total Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  readOnly
                  value={manualEntry.total ?? ''}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-ground/50 text-secondary text-ink font-bold"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={manualSaving}
              className="w-full py-2.5 px-4 rounded-xl bg-primary text-white font-bold text-secondary hover:bg-primary-deep transition-all min-h-[44px]"
            >
              {manualSaving ? 'Saving...' : 'Save Manual Entry'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
