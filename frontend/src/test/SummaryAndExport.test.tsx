import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SummaryAndExport } from '../pages/SummaryAndExport';
import { I18nProvider } from '../i18n/I18nContext';
import { api } from '../api/client';

vi.mock('../api/client', () => ({
  api: {
    entries: {
      list: vi.fn(),
    },
    validation: {
      summary: vi.fn(),
    },
    export: {
      download: vi.fn(),
    },
  },
}));

describe('SummaryAndExport Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.entries.list as any).mockResolvedValue([]);
  });

  it('disables export buttons when blocking errors exist', async () => {
    (api.validation.summary as any).mockResolvedValue({
      period: '2023-10',
      total_entries: 5,
      valid_entries: 3,
      blocking_count: 2,
      warning_count: 1,
      info_count: 0,
      has_blocking_errors: true,
      rate_table_version: '2023-10-01',
      rates_verified: false,
    });

    render(
      <I18nProvider>
        <SummaryAndExport />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Summary & Export')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    // Alert banner should be visible
    expect(screen.getByText(/Filing Export Blocked/i)).toBeInTheDocument();

    // Export buttons should be disabled
    const xlsxBtn = screen.getByRole('button', { name: /Download Excel/i });
    const jsonBtn = screen.getByRole('button', { name: /Download JSON/i });

    expect(xlsxBtn).toBeDisabled();
    expect(jsonBtn).toBeDisabled();

    // Clear explanation message should be shown
    const disabledNotes = screen.getAllByText(/Disabled while 2 blocking error\(s\) exist/i);
    expect(disabledNotes.length).toBeGreaterThan(0);
  });

  it('enables export buttons and downloads file when zero blocking errors exist', async () => {
    (api.validation.summary as any).mockResolvedValue({
      period: '2023-10',
      total_entries: 5,
      valid_entries: 5,
      blocking_count: 0,
      warning_count: 0,
      info_count: 0,
      has_blocking_errors: false,
      rate_table_version: '2023-10-01',
      rates_verified: true,
    });

    (api.export.download as any).mockResolvedValue({
      filename: 'khata_export_2023-10.xlsx',
    });

    render(
      <I18nProvider>
        <SummaryAndExport />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Ready for Export/i)).toBeInTheDocument();
    });

    const xlsxBtn = screen.getByRole('button', { name: /Download Excel/i });
    const jsonBtn = screen.getByRole('button', { name: /Download JSON/i });

    expect(xlsxBtn).not.toBeDisabled();
    expect(jsonBtn).not.toBeDisabled();

    // Click Excel download
    fireEvent.click(xlsxBtn);

    await waitFor(() => {
      expect(api.export.download).toHaveBeenCalledWith(
        expect.any(String),
        'xlsx',
        false
      );
      expect(screen.getByText(/Successfully downloaded khata_export_2023-10.xlsx/i)).toBeInTheDocument();
    });
  });

  it('passes delete_source_images=true when checkbox is toggled', async () => {
    (api.validation.summary as any).mockResolvedValue({
      period: '2023-10',
      total_entries: 3,
      valid_entries: 3,
      blocking_count: 0,
      warning_count: 0,
      info_count: 0,
      has_blocking_errors: false,
      rate_table_version: '2023-10-01',
      rates_verified: true,
    });

    (api.export.download as any).mockResolvedValue({
      filename: 'khata_export_2023-10.json',
    });

    render(
      <I18nProvider>
        <SummaryAndExport />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Ready for Export/i)).toBeInTheDocument();
    });

    // Toggle delete images checkbox
    const checkbox = screen.getByRole('checkbox', {
      name: /Delete raw source invoice images after successful export/i,
    });
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    const jsonBtn = screen.getByRole('button', { name: /Download JSON/i });
    fireEvent.click(jsonBtn);

    await waitFor(() => {
      expect(api.export.download).toHaveBeenCalledWith(
        expect.any(String),
        'json',
        true
      );
    });
  });
});
