import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Upload } from '../pages/Upload';
import { I18nProvider } from '../i18n/I18nContext';
import { api } from '../api/client';

vi.mock('../api/client', () => ({
  api: {
    documents: {
      upload: vi.fn(),
      extract: vi.fn(),
    },
    entries: {
      create: vi.fn(),
    },
  },
}));

describe('Upload Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders doc_type selector and file selection controls', () => {
    render(
      <I18nProvider>
        <Upload />
      </I18nProvider>
    );

    expect(screen.getByText('Upload Invoices')).toBeInTheDocument();
    expect(screen.getByText(/Sales/i)).toBeInTheDocument();
    expect(screen.getByText(/Purchase/i)).toBeInTheDocument();
    expect(screen.getByText('Register Page')).toBeInTheDocument();
    expect(screen.getByText('Camera Photo')).toBeInTheDocument();
    expect(screen.getByText('Select File')).toBeInTheDocument();
  });

  it('switches doc_type on button click', () => {
    render(
      <I18nProvider>
        <Upload />
      </I18nProvider>
    );

    const purchaseBtn = screen.getByText(/Purchase/i);
    fireEvent.click(purchaseBtn);
    expect(purchaseBtn).toHaveClass('bg-blue-50');
  });

  it('automatically falls back to manual entry form when extraction returns FAILED', async () => {
    (api.documents.upload as any).mockResolvedValue({
      id: 10,
      user_id: 1,
      doc_type: 'SALES',
    });

    (api.documents.extract as any).mockResolvedValue({
      status: 'FAILED',
      entries: [],
      page_notes: 'Image is too blurry to read invoice number or total.',
    });

    render(
      <I18nProvider>
        <Upload />
      </I18nProvider>
    );

    // Upload & Extract button initially disabled when no file
    const actionBtn = screen.getByRole('button', { name: /Upload & Extract Entries/i });
    expect(actionBtn).toBeDisabled();

    // Simulate file input
    const file = new File(['dummy invoice image'], 'invoice.png', { type: 'image/png' });
    const hiddenFileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(hiddenFileInput, { target: { files: [file] } });

    expect(actionBtn).not.toBeDisabled();
    fireEvent.click(actionBtn);

    // Extraction should fail and trigger automatic fallback
    await waitFor(() => {
      expect(
        screen.getByText(/Image is too blurry to read invoice number or total/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Automatic fallback triggered: You can fill in the invoice details below/i)
      ).toBeInTheDocument();
      expect(screen.getByText('Manual Invoice Entry')).toBeInTheDocument();
    });

    // Test filling and saving manual form
    (api.entries.create as any).mockResolvedValue({
      id: 99,
      invoice_no: 'MANUAL-001',
    });

    const invoiceNoInput = screen.getByPlaceholderText('INV-001');
    fireEvent.change(invoiceNoInput, { target: { value: 'MANUAL-001' } });

    const taxableInput = screen.getByPlaceholderText('1000.00');
    fireEvent.change(taxableInput, { target: { value: '500' } });

    const saveManualBtn = screen.getByRole('button', { name: /Save Manual Entry/i });
    fireEvent.click(saveManualBtn);

    await waitFor(() => {
      expect(api.entries.create).toHaveBeenCalledWith(
        expect.objectContaining({
          invoice_no: 'MANUAL-001',
          source: 'MANUAL',
        })
      );
      expect(screen.getByText(/Entry saved successfully to Review Table!/i)).toBeInTheDocument();
    });
  });

  it('displays success state when extraction succeeds with entries', async () => {
    (api.documents.upload as any).mockResolvedValue({
      id: 11,
      user_id: 1,
      doc_type: 'SALES',
    });

    (api.documents.extract as any).mockResolvedValue({
      status: 'OK',
      entries: [
        {
          id: 1,
          document_id: 11,
          line_no: 1,
          invoice_no: 'INV-555',
          invoice_date: '2023-10-20',
          party_name: 'Gupta Traders',
          party_gstin: '07AAAAA0000A1Z5',
          hsn_or_category: '1001',
          taxable_value: 1200,
          tax_rate: 18,
          cgst: 108,
          sgst: 108,
          igst: 0,
          total: 1416,
          extraction_provider: 'gemini',
          extraction_model_version: 'gemini-3.5-flash',
        },
      ],
    });

    (api.entries.create as any).mockResolvedValue({ id: 101 });

    render(
      <I18nProvider>
        <Upload />
      </I18nProvider>
    );

    const file = new File(['sample image content'], 'inv.jpg', { type: 'image/jpeg' });
    const hiddenFileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(hiddenFileInput, { target: { files: [file] } });

    const actionBtn = screen.getByRole('button', { name: /Upload & Extract Entries/i });
    fireEvent.click(actionBtn);

    await waitFor(() => {
      expect(screen.getByText(/Successfully extracted and saved 1 entry\(ies\)!/i)).toBeInTheDocument();
    });
  });
});
