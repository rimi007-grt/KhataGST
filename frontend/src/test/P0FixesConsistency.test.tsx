import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ReviewTable } from '../pages/ReviewTable';
import { SummaryScreen } from '../pages/SummaryScreen';
import { ExportScreen } from '../pages/ExportScreen';
import { SourcePhotoPanel } from '../components/SourcePhotoPanel';
import { I18nProvider } from '../i18n/I18nContext';
import { AuthProvider } from '../context/AuthContext';
import { api } from '../api/client';

// Mock API client
vi.mock('../api/client', () => ({
  api: {
    entries: {
      list: vi.fn(),
      seedDemo: vi.fn(),
    },
    validation: {
      validate: vi.fn(),
      summary: vi.fn(),
      counts: vi.fn(),
    },
    export: {
      download: vi.fn(),
    },
  },
}));

// Mock recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Cell: () => <div data-testid="cell" />,
}));

const mockEntries = [
  {
    id: 1,
    user_id: 1,
    invoice_no: 'DEMO-INV-001',
    invoice_date: '2026-11-05',
    party_name: 'Gupta Kirana',
    party_gstin: '27AABCG1234F1Z8',
    hsn_or_category: '1101',
    description: 'Wheat flour',
    taxable_value: 5000,
    tax_rate: 5,
    cgst: 125,
    sgst: 125,
    igst: 0,
    total: 5250,
    entry_type: 'SALES',
    source: 'MANUAL',
    is_demo: true,
    reviewed_at: '2026-11-20T10:00:00Z',
  },
  {
    id: 2,
    user_id: 1,
    invoice_no: 'DEMO-INV-002',
    invoice_date: '2026-11-10',
    party_name: 'Rajasthan Bakery',
    party_gstin: '08AABCR5678D1Z2',
    hsn_or_category: '1905',
    description: 'Cookies',
    taxable_value: 10000,
    tax_rate: 18,
    cgst: 0,
    sgst: 0,
    igst: 1800,
    total: 11800,
    entry_type: 'SALES',
    source: 'MANUAL',
    is_demo: true,
    reviewed_at: '2026-11-20T10:00:00Z',
  },
];

const mockValidationResponse = {
  period: '2026-11',
  total_entries: 2,
  blocking_count: 3,
  warning_count: 2,
  info_count: 0,
  counts: { blocking: 3, warning: 2, info: 0 },
  has_blocking_errors: true,
  entries: [
    {
      entry_id: 1,
      invoice_no: 'DEMO-INV-001',
      invoice_date: '2026-11-05',
      party_name: 'Gupta Kirana',
      total: 5250,
      has_blocking: true,
      results: [
        {
          id: 101,
          rule_id: 'R01',
          severity: 'BLOCKING',
          message_key: 'R01_INVALID_CHECKSUM',
          message: 'The GSTIN check digit doesn\'t match.',
        },
        {
          id: 102,
          rule_id: 'R03',
          severity: 'BLOCKING',
          message_key: 'R03_POS_MISMATCH',
          message: 'Place of supply mismatch.',
        },
        {
          id: 103,
          rule_id: 'R04',
          severity: 'WARNING',
          message_key: 'R04_UNVERIFIED_RATE',
          message: 'Rate table unverified.',
        },
      ],
    },
    {
      entry_id: 2,
      invoice_no: 'DEMO-INV-002',
      invoice_date: '2026-11-10',
      party_name: 'Rajasthan Bakery',
      total: 11800,
      has_blocking: true,
      results: [
        {
          id: 201,
          rule_id: 'R01',
          severity: 'BLOCKING',
          message_key: 'R01_INVALID_CHECKSUM',
          message: 'The GSTIN check digit doesn\'t match.',
        },
        {
          id: 202,
          rule_id: 'R04',
          severity: 'WARNING',
          message_key: 'R04_UNVERIFIED_RATE',
          message: 'Rate table unverified.',
        },
      ],
    },
  ],
};

const mockValidationSummary = {
  period: '2026-11',
  total_entries: 2,
  valid_entries: 0,
  blocking_count: 3,
  warning_count: 2,
  info_count: 0,
  counts: { blocking: 3, warning: 2, info: 0 },
  has_blocking_errors: true,
  rate_table_version: '2023-10-01',
  rates_verified: false,
};

describe('P0 Fixes Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.entries.list as any).mockResolvedValue(mockEntries);
    (api.validation.validate as any).mockResolvedValue(mockValidationResponse);
    (api.validation.summary as any).mockResolvedValue(mockValidationSummary);
    (api.validation.counts as any).mockResolvedValue({ blocking: 3, warning: 2, info: 0 });
  });

  const renderWithProviders = (component: React.ReactElement) => {
    return render(
      <I18nProvider>
        <AuthProvider>{component}</AuthProvider>
      </I18nProvider>
    );
  };

  it('P0.1: Review, Summary, and Export show identical blocking counts for the same data', async () => {
    // 1. Render ExportScreen and verify blocking count = 3
    const { unmount: unmountExport } = renderWithProviders(<ExportScreen />);
    await waitFor(() => {
      expect(screen.getByText(/3 blocking error\(s\) must be resolved before filing/i)).toBeInTheDocument();
    });
    unmountExport();

    // 2. Render ReviewTable and verify return readiness shows 3 blocking errors
    const { unmount: unmountReview } = renderWithProviders(<ReviewTable />);
    await waitFor(() => {
      expect(screen.getByText(/Fix 3 to unlock export/i)).toBeInTheDocument();
    });
    unmountReview();

    // 3. Render SummaryScreen and verify unresolved errors include exactly the same findings
    renderWithProviders(<SummaryScreen />);
    await waitFor(() => {
      expect(screen.getByText(/5 issue\(s\)/i)).toBeInTheDocument();
    });
  });

  it('P0.2: Export JSON option replaces direct GSTN import claim with structured data disclaimer', async () => {
    renderWithProviders(<ExportScreen />);
    await waitFor(() => {
      // Must NOT contain direct GSTN import
      expect(screen.queryByText(/direct GSTN import/i)).not.toBeInTheDocument();
      // Must contain structured data disclaimer
      expect(screen.getByText(/format not yet validated against GSTN schema/i)).toBeInTheDocument();
    });
  });

  it('P0.3: Source image shows placeholder card when missing or error, and bounding boxes only render when valid', () => {
    // A: Missing image -> placeholder card
    const { rerender } = renderWithProviders(<SourcePhotoPanel imageUrl={null} />);
    expect(screen.getByTestId('no-source-image-placeholder')).toBeInTheDocument();
    expect(screen.getByText('No source image')).toBeInTheDocument();

    // B: Invalid bounding box (width = 0, height = 0) -> no highlight box
    rerender(
      <I18nProvider>
        <AuthProvider>
          <SourcePhotoPanel
            imageUrl="/fixtures/sample_invoice.png"
            activeBox={{ x: 10, y: 10, width: 0, height: 0, label: 'ZeroBox' }}
          />
        </AuthProvider>
      </I18nProvider>
    );
    expect(screen.queryByText('ZeroBox')).not.toBeInTheDocument();

    // C: Valid bounding box -> highlight rendered
    rerender(
      <I18nProvider>
        <AuthProvider>
          <SourcePhotoPanel
            imageUrl="/fixtures/sample_invoice.png"
            activeBox={{ x: 10, y: 10, width: 30, height: 20, label: 'Invoice No' }}
          />
        </AuthProvider>
      </I18nProvider>
    );
    expect(screen.getByText('Invoice No')).toBeInTheDocument();
  });

  it('P1.7: Review period picker defaults to global period (Nov 2026), not an empty field', async () => {
    renderWithProviders(<ReviewTable />);
    await waitFor(() => {
      const periodInput = screen.getByPlaceholderText(/All periods/i) as HTMLInputElement;
      expect(periodInput.value).toBe('2026-11');
    });
  });
});
