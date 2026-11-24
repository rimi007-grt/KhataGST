import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportScreen } from '../pages/ExportScreen';
import { I18nProvider } from '../i18n/I18nContext';
import { AuthContext } from '../context/AuthContext';
import { api } from '../api/client';
import { User } from '../types';

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

const mockUser: User = {
  id: 1,
  email: 'test@khatagst.app',
  business_name: 'Sharma Kirana Store',
  gstin: '07AAAAA1234A1Z5',
  state_code: '07',
  scheme: 'REGULAR',
  language: 'en',
};

const renderWithContext = (ui: React.ReactElement, user: User | null = mockUser) => {
  return render(
    <AuthContext.Provider
      value={{
        user,
        token: 'mock-token',
        isLoading: false,
        login: vi.fn(),
        register: vi.fn(),
        updateProfile: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      }}
    >
      <I18nProvider>{ui}</I18nProvider>
    </AuthContext.Provider>
  );
};

describe('ExportScreen (Screen 4 UI Spec)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all 5 checklist items and disables download button when blocking errors exist', async () => {
    (api.validation.summary as any).mockResolvedValue({
      period: '2023-10',
      total_entries: 4,
      valid_entries: 2,
      blocking_count: 2,
      warning_count: 0,
      info_count: 0,
      has_blocking_errors: true,
      rate_table_version: '2023-10-01',
      rates_verified: false,
    });

    (api.entries.list as any).mockResolvedValue([
      { id: 1, entry_type: 'SALES', reviewed_at: '2023-10-15T10:00:00Z' },
      { id: 2, entry_type: 'SALES', reviewed_at: '2023-10-16T10:00:00Z' },
      { id: 3, entry_type: 'SALES', reviewed_at: '2023-10-17T10:00:00Z' },
      { id: 4, entry_type: 'PURCHASE', reviewed_at: '2023-10-18T10:00:00Z' },
    ]);

    renderWithContext(<ExportScreen />);

    await waitFor(() => {
      expect(screen.getByText('Ready to file checklist')).toBeInTheDocument();
    });

    // Item 1: No blocking errors (Failed because 2 blocking errors)
    expect(screen.getByText('No blocking errors')).toBeInTheDocument();
    expect(screen.getByText(/2 blocking error\(s\) must be resolved before filing\./i)).toBeInTheDocument();

    // Item 2: Return period selected
    expect(screen.getByText('Return period selected')).toBeInTheDocument();
    expect(screen.getByText(/Period selected:/i)).toBeInTheDocument();

    // Item 3: GST filing scheme
    expect(screen.getByText('GST filing scheme')).toBeInTheDocument();
    expect(screen.getByText(/Scheme configured: REGULAR/i)).toBeInTheDocument();

    // Item 4: Rate table schedule
    expect(screen.getByText('Rate table schedule')).toBeInTheDocument();
    expect(screen.getByText(/Rate table version: 2023-10-01/i)).toBeInTheDocument();
    expect(screen.getByText(/Contains unverified rows/i)).toBeInTheDocument();

    // Item 5: Review completed
    expect(screen.getByText('Review completed')).toBeInTheDocument();
    expect(screen.getByText(/All 4 entries reviewed/i)).toBeInTheDocument();

    // Export button should be locked
    const exportBtn = screen.getByRole('button', { name: /Export locked: 2 blocking error\(s\)/i });
    expect(exportBtn).toBeDisabled();

    // Static disclaimer must be present
    expect(screen.getByText('Draft prepared for review. Check with your CA before filing.')).toBeInTheDocument();
  });

  it('enables download button and triggers export when all checklist items pass', async () => {
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

    (api.entries.list as any).mockResolvedValue([
      { id: 1, entry_type: 'SALES', reviewed_at: '2023-10-15T10:00:00Z' },
      { id: 2, entry_type: 'SALES', reviewed_at: '2023-10-16T10:00:00Z' },
      { id: 3, entry_type: 'PURCHASE', reviewed_at: '2023-10-17T10:00:00Z' },
    ]);

    (api.export.download as any).mockResolvedValue({
      filename: 'khata_export_2023-10.xlsx',
    });

    renderWithContext(<ExportScreen />);

    await waitFor(() => {
      expect(screen.getByText('Zero blocking errors found. Core statutory checks passed.')).toBeInTheDocument();
    });

    // Rate table schedule verified badge
    expect(screen.getByText(/Official schedule verified/i)).toBeInTheDocument();

    // Download button should be enabled
    const exportBtn = screen.getByRole('button', { name: /Download XLSX Return/i });
    expect(exportBtn).not.toBeDisabled();

    // Click download
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(api.export.download).toHaveBeenCalledWith(
        expect.any(String),
        'xlsx',
        true
      );
      expect(screen.getByText(/Successfully downloaded khata_export_2023-10\.xlsx!/i)).toBeInTheDocument();
    });
  });

  it('supports format selection and delete source images toggle', async () => {
    (api.validation.summary as any).mockResolvedValue({
      period: '2023-10',
      total_entries: 2,
      valid_entries: 2,
      blocking_count: 0,
      warning_count: 0,
      info_count: 0,
      has_blocking_errors: false,
      rate_table_version: '2023-10-01',
      rates_verified: true,
    });

    (api.entries.list as any).mockResolvedValue([
      { id: 1, entry_type: 'SALES', reviewed_at: '2023-10-15T10:00:00Z' },
      { id: 2, entry_type: 'SALES', reviewed_at: '2023-10-16T10:00:00Z' },
    ]);

    (api.export.download as any).mockResolvedValue({
      filename: 'khata_export_2023-10.json',
    });

    renderWithContext(<ExportScreen />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download XLSX Return/i })).toBeInTheDocument();
    });

    // Select JSON format
    const jsonRadio = screen.getByRole('radio', { name: /JSON \(\.json\)/i });
    fireEvent.click(jsonRadio);
    expect(jsonRadio).toHaveAttribute('aria-checked', 'true');

    // Toggle delete images checkbox (checked by default per P2.10)
    const deleteCheckbox = screen.getByRole('checkbox', {
      name: /Delete raw invoice images after download/i,
    });
    expect(deleteCheckbox).toBeChecked();
    fireEvent.click(deleteCheckbox);
    expect(deleteCheckbox).not.toBeChecked();
    fireEvent.click(deleteCheckbox);
    expect(deleteCheckbox).toBeChecked();

    // Now button should say Download JSON Return
    const exportBtn = screen.getByRole('button', { name: /Download JSON Return/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(api.export.download).toHaveBeenCalledWith(
        expect.any(String),
        'json',
        true
      );
      expect(screen.getByText(/Successfully downloaded khata_export_2023-10\.json!/i)).toBeInTheDocument();
    });
  });

  it('provides "Share with my CA" feature generating a read-only link', async () => {
    (api.validation.summary as any).mockResolvedValue({
      period: '2023-10',
      total_entries: 1,
      valid_entries: 1,
      blocking_count: 0,
      warning_count: 0,
      info_count: 0,
      has_blocking_errors: false,
      rate_table_version: '2023-10-01',
      rates_verified: true,
    });

    (api.entries.list as any).mockResolvedValue([
      { id: 1, entry_type: 'SALES', reviewed_at: '2023-10-15T10:00:00Z' },
    ]);

    renderWithContext(<ExportScreen />);

    await waitFor(() => {
      expect(screen.getByText('Accountant Access')).toBeInTheDocument();
    });

    const shareCaBtn = screen.getByRole('button', { name: /Share with my CA/i });
    fireEvent.click(shareCaBtn);

    expect(screen.getByText(/Read-only CA access link/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy link/i })).toBeInTheDocument();
  });

  it('renders the empty state for a period with no entries, and not mixed PASS/ACTION items', async () => {
    (api.validation.summary as any).mockResolvedValue({
      period: '2026-11',
      total_entries: 0,
      valid_entries: 0,
      blocking_count: 0,
      warning_count: 0,
      info_count: 0,
      has_blocking_errors: false,
      rate_table_version: '2023-10-01',
      rates_verified: false,
    });

    (api.entries.list as any).mockResolvedValue([]);

    const mockNavigateScan = vi.fn();
    renderWithContext(<ExportScreen onNavigateToScan={mockNavigateScan} />);

    await waitFor(() => {
      expect(screen.getByTestId('export-empty-state')).toBeInTheDocument();
    });

    // Message says "No entries for <period>. Scan a bill or choose another period."
    expect(screen.getByText(/Scan a bill or choose another period\./i)).toBeInTheDocument();

    // Must NOT render mixed checklist items
    expect(screen.queryByText('Ready to file checklist')).not.toBeInTheDocument();

    // Scan button should be present and call onNavigateToScan
    const scanBtn = screen.getByRole('button', { name: /Scan bill/i });
    expect(scanBtn).toBeInTheDocument();
    fireEvent.click(scanBtn);
    expect(mockNavigateScan).toHaveBeenCalledTimes(1);

    // "Load DEMO data" button should be present
    expect(screen.getByRole('button', { name: /Load demo data/i })).toBeInTheDocument();

    // Download button must be locked
    const exportBtn = screen.getByRole('button', { name: /Export locked: No entries to file/i });
    expect(exportBtn).toBeDisabled();
  });

  it('renders a passing state for a period with reviewed entries and no blocking errors', async () => {
    (api.validation.summary as any).mockResolvedValue({
      period: '2026-11',
      total_entries: 2,
      valid_entries: 2,
      blocking_count: 0,
      warning_count: 0,
      info_count: 0,
      has_blocking_errors: false,
      rate_table_version: '2023-10-01',
      rates_verified: true,
    });

    (api.entries.list as any).mockResolvedValue([
      { id: 101, entry_type: 'SALES', invoice_no: 'DEMO-INV-001', reviewed_at: '2026-11-05T10:00:00Z' },
      { id: 102, entry_type: 'SALES', invoice_no: 'DEMO-INV-002', reviewed_at: '2026-11-10T10:00:00Z' },
    ]);

    renderWithContext(<ExportScreen />);

    await waitFor(() => {
      expect(screen.getByText('Ready to file checklist')).toBeInTheDocument();
    });

    // Overall badge is PASS
    expect(screen.getAllByText(/pass/i).length).toBeGreaterThanOrEqual(1);

    // All items pass
    expect(screen.getByText('Zero blocking errors found. Core statutory checks passed.')).toBeInTheDocument();
    expect(screen.getByText(/All 2 entries reviewed/i)).toBeInTheDocument();

    // Download button is enabled
    const exportBtn = screen.getByRole('button', { name: /Download XLSX Return/i });
    expect(exportBtn).not.toBeDisabled();
  });
});
