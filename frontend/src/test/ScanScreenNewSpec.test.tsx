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

describe('UI_SPEC Screen 1: Scan Screen Features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Enter manually" button and immediately opens manual entry form', async () => {
    render(
      <I18nProvider>
        <Upload />
      </I18nProvider>
    );

    const manualBtn = screen.getByRole('button', { name: /Enter manually/i });
    expect(manualBtn).toBeInTheDocument();

    fireEvent.click(manualBtn);

    expect(screen.getByText('Manual Invoice Entry')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('INV-001')).toBeInTheDocument();
  });

  it('supports multi-page thumbnail strip with remove and add another page controls', async () => {
    render(
      <I18nProvider>
        <Upload />
      </I18nProvider>
    );

    // Empty state initially shown
    expect(screen.getByText('No document chosen yet')).toBeInTheDocument();

    // Add first page
    const file1 = new File(['page 1 image'], 'page1.png', { type: 'image/png' });
    const hiddenFileInput = document.querySelectorAll('input[type="file"]')[0] as HTMLInputElement;
    fireEvent.change(hiddenFileInput, { target: { files: [file1] } });

    // Thumbnails strip appears
    expect(screen.getByText(/1 page\(s\) selected/i)).toBeInTheDocument();
    expect(screen.getByAltText('Page 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add another page/i })).toBeInTheDocument();

    // Remove page
    const removeBtn = screen.getByRole('button', { name: /Remove page 1/i });
    fireEvent.click(removeBtn);

    // Empty state returns
    expect(screen.getByText('No document chosen yet')).toBeInTheDocument();
  });

  it('shows skeleton rows during extraction state without spinners', async () => {
    (api.documents.upload as any).mockResolvedValue({ id: 20 });
    // Keep extraction pending
    (api.documents.extract as any).mockImplementation(() => new Promise(() => {}));

    render(
      <I18nProvider>
        <Upload />
      </I18nProvider>
    );

    const file = new File(['invoice content'], 'inv.png', { type: 'image/png' });
    const hiddenFileInput = document.querySelectorAll('input[type="file"]')[0] as HTMLInputElement;
    fireEvent.change(hiddenFileInput, { target: { files: [file] } });

    const uploadBtn = screen.getByRole('button', { name: /Upload & Extract Entries/i });
    fireEvent.click(uploadBtn);

    // Extraction state with skeleton rows (no spinner)
    await waitFor(() => {
      expect(
        screen.getByText(/Extracting ledger entries with deterministic OCR.../i)
      ).toBeInTheDocument();
      // Spinner icon is NOT present
      expect(document.querySelector('.lucide-loader-2')).not.toBeInTheDocument();
    });
  });
});

