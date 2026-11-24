import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReturnReadinessCard } from '../components/ReturnReadinessCard';
import { EntryCard } from '../components/EntryCard';
import { SummaryScreen } from '../pages/SummaryScreen';
import { ExportScreen } from '../pages/ExportScreen';
import { I18nProvider } from '../i18n/I18nContext';
import { AuthContext } from '../context/AuthContext';
import { api } from '../api/client';
import { User, EntryReviewed } from '../types';

vi.mock('../api/client', () => ({
  api: {
    entries: {
      list: vi.fn(),
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

const mockUser: User = {
  id: 1,
  email: 'shopkeeper@khatagst.app',
  business_name: 'Gupta Kirana',
  gstin: '07AAAAA0000A1Z5',
  state_code: '07',
  scheme: 'REGULAR',
  language: 'en',
};

const renderWithAuth = (ui: React.ReactElement) => {
  return render(
    <AuthContext.Provider
      value={{
        user: mockUser,
        token: 'token',
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

describe('UI_SPEC Acceptance Criteria Compliance Audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calculates readiness percentage exactly from backend validation results (Criterion 3)', () => {
    // Exactly matches backend: 4 total entries, 1 blocking error -> 3 clean entries = 75%
    const { container } = render(
      <I18nProvider>
        <ReturnReadinessCard
          totalEntries={4}
          entriesWithoutBlocking={3}
          blockingCount={1}
        />
      </I18nProvider>
    );

    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(
      screen.getByText(/3 of 4 entries have no blocking errors\./i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Fix 1 to unlock export\./i)).toBeInTheDocument();

    // Verify arc stroke uses --hl-arc
    const arcCircle = container.querySelectorAll('circle')[1];
    expect(arcCircle).toHaveAttribute('stroke', 'var(--hl-arc)');
  });

  it('matches totals and excludes blocking entries exactly in SummaryScreen (Criterion 3)', async () => {
    (api.entries.list as any).mockResolvedValue([
      {
        id: 1,
        entry_type: 'SALES',
        taxable_value: 20000,
        cgst: 1800,
        sgst: 1800,
        igst: 0,
        total: 23600,
      },
      {
        id: 2,
        entry_type: 'SALES',
        taxable_value: 50000,
        cgst: 4500,
        sgst: 4500,
        igst: 0,
        total: 59000,
      },
      {
        id: 3,
        entry_type: 'PURCHASE',
        taxable_value: 10000,
        cgst: 900,
        sgst: 900,
        igst: 0,
        total: 11800,
      },
    ]);

    // Backend validation response: Entry 2 has blocking error
    (api.validation.validate as any).mockResolvedValue({
      period: '2026-11',
      total_entries: 3,
      blocking_count: 1,
      warning_count: 0,
      info_count: 0,
      has_blocking_errors: true,
      entries: [
        {
          entry_id: 2,
          has_blocking: true,
          results: [
            {
              id: 99,
              rule_id: 'R02',
              severity: 'BLOCKING',
              message_key: 'R02_TOTAL_MISMATCH',
              message: 'Calculated total does not match invoice total.',
            },
          ],
        },
      ],
    });

    renderWithAuth(<SummaryScreen />);

    await waitFor(() => {
      // Must exclude Entry 2 (₹59,000.00) from Sales Total -> only Entry 1 (₹23,600.00)
      expect(screen.getByText('₹23,600.00')).toBeInTheDocument();
      // Must exclude Entry 2 tax (₹9,000.00) from Tax Collected -> only Entry 1 (₹3,600.00)
      expect(screen.getByText('₹3,600.00')).toBeInTheDocument();
      // Purchases ITC total
      expect(screen.getByText('₹11,800.00')).toBeInTheDocument();
      // Mandatory exclusion note
      expect(
        screen.getByText('Totals exclude entries with blocking errors')
      ).toBeInTheDocument();
    });
  });

  it('locks export button whenever a BLOCKING error exists (Criterion 5)', async () => {
    (api.validation.summary as any).mockResolvedValue({
      period: '2026-11',
      total_entries: 5,
      valid_entries: 3,
      blocking_count: 2,
      warning_count: 0,
      info_count: 0,
      has_blocking_errors: true,
      rate_table_version: '2023-10-01',
      rates_verified: true,
    });

    (api.entries.list as any).mockResolvedValue([
      { id: 1, entry_type: 'SALES', reviewed_at: '2026-11-01T10:00:00Z' },
    ]);

    renderWithAuth(<ExportScreen />);

    await waitFor(() => {
      const lockedBtn = screen.getByRole('button', {
        name: /Export locked: 2 blocking error\(s\)/i,
      });
      expect(lockedBtn).toBeDisabled();
    });
  });

  it('renders bilingual explanation in EntryCard (Criterion from Screen 2 spec)', () => {
    const mockEntry: EntryReviewed = {
      id: 1,
      user_id: 1,
      source: 'MANUAL',
      entry_type: 'SALES',
      invoice_no: 'INV-101',
      party_name: 'Sharma Traders',
      total: 5000,
      reviewed_at: '2026-11-01T10:00:00Z',
    };

    render(
      <I18nProvider>
        <EntryCard
          entry={mockEntry}
          findings={[
            {
              id: 1,
              rule_id: 'R01',
              severity: 'BLOCKING',
              message_key: 'R01_INVALID_FORMAT',
              message: 'GSTIN must be 15 alphanumeric characters matching standard GST format.',
            },
          ]}
          isExpandedDefault={true}
          onSaveEntry={vi.fn()}
        />
      </I18nProvider>
    );

    // Primary English message
    expect(
      screen.getByText('GSTIN must be 15 alphanumeric characters matching standard GST format.')
    ).toBeInTheDocument();

    // Secondary Hindi message
    expect(
      screen.getByText('जीएसटीआईएन 15 अक्षरों का मानक प्रारूप में होना चाहिए।')
    ).toBeInTheDocument();

    // Action button that opens editor
    expect(screen.getByRole('button', { name: /Edit field/i })).toBeInTheDocument();
  });

  it('guarantees zero emoji across rendered UI (Criterion 7)', async () => {
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

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
      { id: 1, entry_type: 'SALES', total: 1000, reviewed_at: '2026-11-01T10:00:00Z' },
    ]);

    const { container } = renderWithAuth(<ExportScreen />);

    await waitFor(() => {
      expect(screen.getByText('Ready to file checklist')).toBeInTheDocument();
    });

    const pageText = container.textContent || '';
    expect(emojiRegex.test(pageText)).toBe(false);
  });
});

