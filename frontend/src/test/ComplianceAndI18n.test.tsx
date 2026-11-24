import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReviewTable } from '../pages/ReviewTable';
import { SummaryAndExport } from '../pages/SummaryAndExport';
import { Navbar } from '../components/Navbar';
import { ErrorModal } from '../components/ErrorModal';
import { I18nProvider, useTranslation } from '../i18n/I18nContext';
import { AuthProvider } from '../context/AuthContext';
import { api } from '../api/client';

vi.mock('../api/client', () => ({
  api: {
    auth: {
      getMe: vi.fn(),
    },
    entries: {
      list: vi.fn(),
      update: vi.fn(),
    },
    validation: {
      validate: vi.fn(),
      summary: vi.fn(),
    },
    export: {
      download: vi.fn(),
    },
  },
}));

describe('Step 7 UX & Compliance Guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (api.auth.getMe as any).mockRejectedValue(new Error('Unauthenticated'));
  });

  it('provides live language toggle switching English to Hindi across UI labels', async () => {
    const TestComponent = () => {
      const { t, language, toggleLanguage } = useTranslation();
      return (
        <div>
          <span data-testid="title">{t('auth.title')}</span>
          <span data-testid="upload-tab">{t('nav.upload')}</span>
          <button onClick={toggleLanguage}>Switch</button>
        </div>
      );
    };

    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    );

    // Initial English
    expect(screen.getByTestId('title')).toHaveTextContent('KhataGST');
    expect(screen.getByTestId('upload-tab')).toHaveTextContent('Upload');

    // Switch to Hindi
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));

    expect(screen.getByTestId('title')).toHaveTextContent('खाताजीएसटी');
    expect(screen.getByTestId('upload-tab')).toHaveTextContent('अपलोड');
  });

  it('translates R01-R10 rule explanations in English and Hindi in the ErrorModal', () => {
    const findings = [
      {
        rule_id: 'R01',
        severity: 'BLOCKING' as const,
        message_key: 'R01_INVALID_FORMAT',
        message: 'GSTIN must be 15 alphanumeric characters matching standard GST format.',
      },
      {
        rule_id: 'R02',
        severity: 'BLOCKING' as const,
        message_key: 'R02_TAX_MISMATCH',
        message_params: { expected: 180, actual: 150 },
        message: 'Calculated tax Rs 180 does not match total tax Rs 150',
      },
    ];

    const { rerender } = render(
      <I18nProvider>
        <ErrorModal isOpen={true} onClose={() => {}} invoiceNo="INV-001" findings={findings} />
      </I18nProvider>
    );

    // English rule message
    expect(
      screen.getByText(/GSTIN must be 15 alphanumeric characters matching standard GST format/i)
    ).toBeInTheDocument();

    // Click Hindi switch in modal header
    const langBtn = screen.getByRole('button', { name: /Switch language|हिन्दी/i });
    fireEvent.click(langBtn);

    // Should now display Hindi statutory explanation
    expect(
      screen.getByText(/जीएसटीआईएन 15 अक्षरों का मानक प्रारूप में होना चाहिए/i)
    ).toBeInTheDocument();
  });

  it('visually highlights low-confidence OCR fields (< 85%) in amber in the Review Table', async () => {
    const lowConfidenceEntries = [
      {
        id: 1,
        user_id: 1,
        source: 'EXTRACTED_EDITED' as const,
        entry_type: 'SALES' as const,
        invoice_no: 'INV-UNCERTAIN-99',
        invoice_date: '2023-10-15',
        party_name: 'Blurry Mart',
        party_gstin: '07AAAAA0000A1Z5',
        hsn_or_category: '1001',
        taxable_value: 1500.0,
        tax_rate: 18.0,
        cgst: 135.0,
        sgst: 135.0,
        igst: 0.0,
        total: 1770.0,
        is_demo: false,
        field_confidence: {
          invoice_no: 0.62, // LOW confidence < 0.85
          taxable_value: 0.70, // LOW confidence < 0.85
          party_name: 0.98, // High confidence >= 0.85
        },
        reviewed_at: '2023-10-15T10:00:00Z',
      },
    ];

    (api.entries.list as any).mockResolvedValue(lowConfidenceEntries);
    (api.validation.validate as any).mockResolvedValue({
      period: '2023-10',
      total_entries: 1,
      blocking_count: 0,
      warning_count: 0,
      info_count: 0,
      has_blocking_errors: false,
      entries: [{ entry_id: 1, results: [] }],
    });
    (api.validation.summary as any).mockResolvedValue({
      period: '2023-10',
      total_entries: 1,
      valid_entries: 1,
      blocking_count: 0,
      warning_count: 0,
      info_count: 0,
      has_blocking_errors: false,
      rate_table_version: '2023-10-01',
      rates_verified: false,
    });

    render(
      <I18nProvider>
        <ReviewTable />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('INV-UNCERTAIN-99')).toBeInTheDocument();
    });

    // Alert header callout for uncertain OCR
    expect(screen.getByRole('region', { name: /Low Confidence Alert/i })).toBeInTheDocument();

    // Check that low-confidence invoice_no input has amber highlight class
    const invoiceNoInput = screen.getByDisplayValue('INV-UNCERTAIN-99');
    expect(invoiceNoInput).toHaveClass('bg-amber-100/90');
    expect(invoiceNoInput).toHaveClass('border-amber-400');
    expect(invoiceNoInput).toHaveAttribute('title', expect.stringContaining('Low OCR confidence (62%)'));

    // High confidence field (party_name) should NOT have amber class
    const partyNameInput = screen.getByDisplayValue('Blurry Mart');
    expect(partyNameInput).not.toHaveClass('bg-amber-100/90');
  });

  it('renders persistent DEMO banner when demo data is active', async () => {
    const demoEntries = [
      {
        id: 1,
        user_id: 1,
        source: 'EXTRACTED_EDITED' as const,
        entry_type: 'SALES' as const,
        invoice_no: 'DEMO-INV-001',
        invoice_date: '2026-11-05',
        party_name: 'DEMO - Gupta Kirana Store',
        is_demo: true,
        reviewed_at: '2026-11-05T10:00:00Z',
      },
    ];

    (api.entries.list as any).mockResolvedValue(demoEntries);
    (api.validation.validate as any).mockResolvedValue({
      period: '2026-11',
      total_entries: 1,
      entries: [{ entry_id: 1, results: [] }],
    });
    (api.validation.summary as any).mockResolvedValue({
      period: '2026-11',
      total_entries: 1,
      valid_entries: 1,
      blocking_count: 0,
      has_blocking_errors: false,
      rate_table_version: '2023-10-01',
      rates_verified: false,
    });

    render(
      <I18nProvider>
        <ReviewTable />
      </I18nProvider>
    );

    await waitFor(() => {
      // Demo banner alert is displayed
      const banner = screen.getByRole('alert');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent(/DEMO DATA: You are viewing offline fixtures/i);
      expect(banner).toHaveTextContent(/DEMO MODE/i);
    });
  });

  it('displays the mandatory "Rates as of <date>, verify with official CBIC/GSTN notifications." banner', async () => {
    (api.entries.list as any).mockResolvedValue([]);
    (api.validation.summary as any).mockResolvedValue({
      period: '2023-10',
      total_entries: 0,
      valid_entries: 0,
      blocking_count: 0,
      warning_count: 0,
      info_count: 0,
      has_blocking_errors: false,
      rate_table_version: '2023-10-01',
      rates_verified: true,
    });

    render(
      <I18nProvider>
        <SummaryAndExport />
      </I18nProvider>
    );

    await waitFor(() => {
      // Mandatory rates banner must be present
      const ratesRegion = screen.getByRole('region', { name: /GST Rates Table Status/i });
      expect(ratesRegion).toBeInTheDocument();
      expect(ratesRegion).toHaveTextContent(/Rates schedule: 2023-10-01/i);
    });
  });
});

