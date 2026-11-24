import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SummaryScreen } from '../pages/SummaryScreen';
import { I18nProvider } from '../i18n/I18nContext';
import { api } from '../api/client';

vi.mock('../api/client', () => ({
  api: {
    entries: {
      list: vi.fn(),
    },
    validation: {
      validate: vi.fn(),
    },
  },
}));

describe('SummaryScreen (Screen 3 UI Spec)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders 3 stat tiles and includes all entries when zero blocking errors exist', async () => {
    (api.entries.list as any).mockResolvedValue([
      {
        id: 1,
        entry_type: 'SALES',
        taxable_value: 10000,
        cgst: 900,
        sgst: 900,
        igst: 0,
        total: 11800,
        invoice_no: 'INV-001',
      },
      {
        id: 2,
        entry_type: 'SALES',
        taxable_value: 5000,
        cgst: 250,
        sgst: 250,
        igst: 0,
        total: 5500,
        invoice_no: 'INV-002',
      },
      {
        id: 3,
        entry_type: 'PURCHASE',
        taxable_value: 8000,
        cgst: 720,
        sgst: 720,
        igst: 0,
        total: 9440,
        invoice_no: 'PUR-001',
      },
    ]);

    (api.validation.validate as any).mockResolvedValue({
      period: '2023-10',
      total_entries: 3,
      blocking_count: 0,
      warning_count: 0,
      info_count: 0,
      has_blocking_errors: false,
      entries: [],
    });

    render(
      <I18nProvider>
        <SummaryScreen />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Period summary')).toBeInTheDocument();
    });

    // Three stat tiles:
    // Sales total: 11800 + 5500 = 17300
    expect(screen.getByText('Sales total')).toBeInTheDocument();
    expect(screen.getByText('₹17,300.00')).toBeInTheDocument();

    // Tax collected: 900 + 900 + 250 + 250 = 2300
    expect(screen.getByText('Tax collected')).toBeInTheDocument();
    expect(screen.getByText('₹2,300.00')).toBeInTheDocument();

    // Purchases (for ITC reconciliation): 9440
    expect(screen.getByText('Purchases (ITC)')).toBeInTheDocument();
    expect(screen.getByText('₹9,440.00')).toBeInTheDocument();

    // No exclusion note since 0 blocking errors
    expect(
      screen.queryByText(/Totals exclude entries with blocking errors/i)
    ).not.toBeInTheDocument();

    // Recharts Bar chart container is present
    expect(screen.getByRole('region', { name: /Errors by rule chart/i })).toBeInTheDocument();
    expect(screen.getByText(/All statutory checks passed/i)).toBeInTheDocument();
  });

  it('excludes entries with blocking errors from stat tiles and shows exclusion note', async () => {
    (api.entries.list as any).mockResolvedValue([
      {
        id: 1,
        entry_type: 'SALES',
        taxable_value: 10000,
        cgst: 900,
        sgst: 900,
        igst: 0,
        total: 11800,
        invoice_no: 'INV-CLEAN-01',
        party_name: 'Sharma Stores',
      },
      {
        id: 2,
        entry_type: 'SALES',
        taxable_value: 50000,
        cgst: 4500,
        sgst: 4500,
        igst: 0,
        total: 59000,
        invoice_no: 'INV-BLOCKING-02',
        party_name: 'Gupta Enterprises',
      },
      {
        id: 3,
        entry_type: 'PURCHASE',
        taxable_value: 8000,
        cgst: 720,
        sgst: 720,
        igst: 0,
        total: 9440,
        invoice_no: 'PUR-CLEAN-01',
        party_name: 'Wholesale Depot',
      },
    ]);

    (api.validation.validate as any).mockResolvedValue({
      period: '2023-10',
      total_entries: 3,
      blocking_count: 1,
      warning_count: 0,
      info_count: 0,
      has_blocking_errors: true,
      entries: [
        {
          entry_id: 2,
          invoice_no: 'INV-BLOCKING-02',
          party_name: 'Gupta Enterprises',
          has_blocking: true,
          results: [
            {
              id: 101,
              rule_id: 'R01',
              severity: 'BLOCKING',
              message_key: 'R01_INVALID_FORMAT',
              message: 'GSTIN must be 15 alphanumeric characters matching standard GST format.',
            },
          ],
        },
      ],
    });

    const mockNavigate = vi.fn();

    render(
      <I18nProvider>
        <SummaryScreen onNavigateToReview={mockNavigate} />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Totals exclude entries with blocking errors')).toBeInTheDocument();
    });

    // Sales Total should EXCLUDE Entry 2 (59000) -> Only Entry 1 (11800)
    expect(screen.getByText('₹11,800.00')).toBeInTheDocument();

    // Tax collected should EXCLUDE Entry 2 (9000) -> Only Entry 1 (1800)
    expect(screen.getByText('₹1,800.00')).toBeInTheDocument();

    // Purchases: 9440
    expect(screen.getByText('₹9,440.00')).toBeInTheDocument();

    // Unresolved error list should show Entry 2 finding
    expect(screen.getByText('Unresolved errors')).toBeInTheDocument();
    expect(screen.getByText(/GSTIN must be 15 alphanumeric characters/i)).toBeInTheDocument();
    expect(screen.getByText('INV-BLOCKING-02')).toBeInTheDocument();

    // Clicking "Fix in Review" should call onNavigateToReview(2)
    const fixBtn = screen.getByRole('button', { name: /Fix in Review/i });
    fireEvent.click(fixBtn);
    expect(mockNavigate).toHaveBeenCalledWith(2);
  });
});

