import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReviewTable } from '../pages/ReviewTable';
import { I18nProvider } from '../i18n/I18nContext';
import { api } from '../api/client';

vi.mock('../api/client', () => ({
  api: {
    entries: {
      list: vi.fn(),
      update: vi.fn(),
    },
    validation: {
      validate: vi.fn(),
      summary: vi.fn(),
    },
  },
}));

describe('ReviewTable Component', () => {
  const mockEntries = [
    {
      id: 1,
      user_id: 1,
      source: 'EXTRACTED_EDITED',
      entry_type: 'SALES',
      invoice_no: 'INV-101',
      invoice_date: '2023-10-15',
      party_name: 'Sharma Traders',
      party_gstin: '07AAAAA0000A1Z5',
      hsn_or_category: '1001',
      description: 'Wheat',
      taxable_value: 1000.0,
      tax_rate: 18.0,
      cgst: 90.0,
      sgst: 90.0,
      igst: 0.0,
      total: 1180.0,
      is_demo: false,
      reviewed_at: '2023-10-15T10:00:00Z',
    },
    {
      id: 2,
      user_id: 1,
      source: 'MANUAL',
      entry_type: 'SALES',
      invoice_no: 'INV-102',
      invoice_date: '2023-10-16',
      party_name: 'Verma Enterprises',
      party_gstin: 'INVALIDGSTIN',
      hsn_or_category: '2001',
      description: 'Pickles',
      taxable_value: 500.0,
      tax_rate: 12.0,
      cgst: 30.0,
      sgst: 30.0,
      igst: 0.0,
      total: 560.0,
      is_demo: false,
      reviewed_at: '2023-10-16T11:00:00Z',
    },
  ];

  const mockValidationResponse = {
    period: '2023-10',
    total_entries: 2,
    blocking_count: 1,
    warning_count: 0,
    info_count: 0,
    has_blocking_errors: true,
    entries: [
      {
        entry_id: 1,
        invoice_no: 'INV-101',
        has_blocking: false,
        results: [],
      },
      {
        entry_id: 2,
        invoice_no: 'INV-102',
        has_blocking: true,
        results: [
          {
            id: 1,
            rule_id: 'R01',
            severity: 'BLOCKING',
            message_key: 'R01_INVALID_FORMAT',
            message: 'GSTIN must be 15 alphanumeric characters matching standard GST format.',
          },
        ],
      },
    ],
  };

  const mockSummaryResponse = {
    period: '2023-10',
    total_entries: 2,
    valid_entries: 1,
    blocking_count: 1,
    warning_count: 0,
    info_count: 0,
    has_blocking_errors: true,
    rate_table_version: '2023-10-01',
    rates_verified: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.entries.list as any).mockResolvedValue(mockEntries);
    (api.validation.validate as any).mockResolvedValue(mockValidationResponse);
    (api.validation.summary as any).mockResolvedValue(mockSummaryResponse);
  });

  it('renders table headers and entries properly', async () => {
    render(
      <I18nProvider>
        <ReviewTable />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Review Invoices Table')).toBeInTheDocument();
      expect(screen.getByDisplayValue('INV-101')).toBeInTheDocument();
      expect(screen.getByDisplayValue('INV-102')).toBeInTheDocument();
    });
  });

  it('displays per-row validation badges with correct severity', async () => {
    render(
      <I18nProvider>
        <ReviewTable />
      </I18nProvider>
    );

    await waitFor(() => {
      // Entry 1 has no errors -> Compliant badge
      expect(screen.getByText('Compliant')).toBeInTheDocument();
      // Entry 2 has 1 blocking error -> Blocking badge
      expect(screen.getByText('1 Blocking Error')).toBeInTheDocument();
    });
  });

  it('opens modal drawer with error details when clicking on badge', async () => {
    render(
      <I18nProvider>
        <ReviewTable />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('1 Blocking Error')).toBeInTheDocument();
    });

    // Click on the blocking error badge
    fireEvent.click(screen.getByText('1 Blocking Error'));

    // Modal should now be open
    await waitFor(() => {
      expect(screen.getByText('Validation Findings')).toBeInTheDocument();
      expect(screen.getByText(/GSTIN must be 15 alphanumeric characters/i)).toBeInTheDocument();
      expect(screen.getByText('R01')).toBeInTheDocument();
    });

    // Click close button
    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => {
      expect(screen.queryByText('Validation Findings')).not.toBeInTheDocument();
    });
  });

  it('allows editing cells and saving changes via PATCH /entries/{id}', async () => {
    (api.entries.update as any).mockResolvedValue({
      ...mockEntries[0],
      party_name: 'Sharma Brothers',
    });

    render(
      <I18nProvider>
        <ReviewTable />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Sharma Traders')).toBeInTheDocument();
    });

    const partyInput = screen.getByDisplayValue('Sharma Traders');
    fireEvent.change(partyInput, { target: { value: 'Sharma Brothers' } });

    // Save button should appear
    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeInTheDocument();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.entries.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ party_name: 'Sharma Brothers' })
      );
    });
  });
});
