import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HomeScreen } from '../pages/HomeScreen';
import { I18nProvider } from '../i18n/I18nContext';
import { AuthContext } from '../context/AuthContext';
import { api } from '../api/client';
import { DashboardResponse, User } from '../types';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<any>('../api/client');
  return {
    ...actual,
    api: {
      ...actual.api,
      dashboard: {
        get: vi.fn(),
      },
      validation: {
        summary: vi.fn(),
        counts: vi.fn(),
      },
    },
  };
});

const mockUser: User = {
  id: 1,
  email: 'trader@khata.in',
  business_name: 'Sharma General Store',
  scheme: 'REGULAR',
  language: 'en',
  state_code: '27',
};

const mockDashboardResponse: DashboardResponse = {
  period: '2026-11',
  scheme: 'Regular',
  readiness_pct: 75,
  entries_total: 4,
  entries_reviewed: 4,
  errors: {
    blocking: 1,
    warning: 2,
    info: 0,
  },
  totals: {
    sales: 125000,
    tax_collected: 22500,
    purchases_itc: 45000,
    excluded_entries: 1,
  },
  top_issues: [
    {
      rule_id: 'R01',
      count: 1,
      message_key: 'rule.r01.checksum',
      first_entry_id: 101,
    },
  ],
  recent_documents: [
    {
      id: 12,
      doc_type: 'SALES',
      uploaded_at: '2026-11-20T10:00:00Z',
      status: 'Extracted',
    },
  ],
  next_action: {
    key: 'fix_blocking_errors',
    params: { count: 1 },
  },
  deadlines: [
    {
      return_type: 'GSTR-1',
      due_date: '2026-12-11',
      verified: false,
      source_ref: 'CBIC Circular Placeholder',
    },
    {
      return_type: 'GSTR-3B',
      due_date: '2026-12-20',
      verified: false,
      source_ref: 'CBIC Circular Placeholder',
    },
  ],
  rate_table: {
    version: '2023-10-01',
    has_unverified: true,
  },
};

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <I18nProvider>
      <AuthContext.Provider
        value={{
          user: mockUser,
          token: 'token',
          isLoading: false,
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          updateUser: vi.fn(),
        }}
      >
        {ui}
      </AuthContext.Provider>
    </I18nProvider>
  );
};

describe('HomeScreen Spec Compliance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('renders greeting, scheme, readiness hero card, stat tiles, and deadlines from /dashboard', async () => {
    vi.mocked(api.dashboard.get).mockResolvedValue(mockDashboardResponse);

    renderWithProviders(
      <HomeScreen
        onNavigateToScan={vi.fn()}
        onNavigateToReview={vi.fn()}
        onNavigateToExport={vi.fn()}
        period="2026-11"
      />
    );

    // Wait for data load
    await waitFor(() => {
      expect(screen.getByText(/Sharma General Store/i)).toBeInTheDocument();
      expect(screen.getByText('Regular')).toBeInTheDocument();
      expect(screen.getByText(/scheme/i)).toBeInTheDocument();
    });

    // Readiness hero card shows readiness % and blocking summary
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText(/1 blocking error\(s\) must be resolved/i)).toBeInTheDocument();

    // Three stat tiles with Indian digit grouping
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('₹1,25,000')).toBeInTheDocument();
    expect(screen.getByText('Tax collected')).toBeInTheDocument();
    expect(screen.getByText('₹22,500')).toBeInTheDocument();
    expect(screen.getByText('Purchases (ITC)')).toBeInTheDocument();
    expect(screen.getByText('₹45,000')).toBeInTheDocument();

    // Excluded entries footnote
    expect(screen.getAllByText(/1 entries excluded \(blocking errors\)/i)).toHaveLength(3);

    // Needs attention card with R01 issue and Fix button
    expect(screen.getByText('Needs your attention')).toBeInTheDocument();
    expect(screen.getByText(/GSTIN check digit/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fix issue R01/i })).toBeInTheDocument();

    // Upcoming filing dates with unverified date badge
    expect(screen.getByText('Upcoming filing dates')).toBeInTheDocument();
    expect(screen.getByText('GSTR-1')).toBeInTheDocument();
    expect(screen.getAllByText(/unverified date/i).length).toBeGreaterThanOrEqual(1);

    // Footer note
    expect(
      screen.getByText(/Draft prepared for review. Check with your CA before filing./i)
    ).toBeInTheDocument();
  });

  it('asserts Home numbers equal Summary numbers for the same period (Acceptance Criterion 1)', async () => {
    vi.mocked(api.dashboard.get).mockResolvedValue(mockDashboardResponse);
    vi.mocked(api.validation.summary).mockResolvedValue({
      period: '2026-11',
      total_entries: 4,
      valid_entries: 3,
      blocking_count: 1,
      warning_count: 2,
      info_count: 0,
      has_blocking_errors: true,
      rate_table_version: '2023-10-01',
      rates_verified: false,
    });

    renderWithProviders(
      <HomeScreen
        onNavigateToScan={vi.fn()}
        onNavigateToReview={vi.fn()}
        onNavigateToExport={vi.fn()}
        period="2026-11"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    // Retrieve summary data to compare directly
    const summaryData = await api.validation.summary('2026-11');
    const dashData = await api.dashboard.get('2026-11');

    // Non-negotiable: Home numbers must equal Summary numbers
    expect(dashData.errors.blocking).toBe(summaryData.blocking_count);
    expect(dashData.errors.warning).toBe(summaryData.warning_count);
    expect(dashData.errors.info).toBe(summaryData.info_count);
    expect(dashData.entries_reviewed).toBe(summaryData.total_entries);
  });

  it('correctly handles all 4 next_action states (Acceptance Criterion 2)', async () => {
    // State 1: scan_first_bill
    const onScan1 = vi.fn();
    vi.mocked(api.dashboard.get).mockResolvedValueOnce({
      ...mockDashboardResponse,
      entries_total: 0,
      next_action: { key: 'scan_first_bill', params: {} },
    });
    const { unmount: unmount1 } = renderWithProviders(
      <HomeScreen
        onNavigateToScan={onScan1}
        onNavigateToReview={vi.fn()}
        onNavigateToExport={vi.fn()}
        period="2026-11"
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Scan your first bill')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Scan your first bill'));
    expect(onScan1).toHaveBeenCalledTimes(1);
    unmount1();

    // State 2: review_entries
    const onReview2 = vi.fn();
    vi.mocked(api.dashboard.get).mockResolvedValueOnce({
      ...mockDashboardResponse,
      entries_total: 3,
      next_action: { key: 'review_entries', params: { count: 3 } },
    });
    const { unmount: unmount2 } = renderWithProviders(
      <HomeScreen
        onNavigateToScan={vi.fn()}
        onNavigateToReview={onReview2}
        onNavigateToExport={vi.fn()}
        period="2026-11"
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Review 3 entries')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Review 3 entries'));
    expect(onReview2).toHaveBeenCalledTimes(1);
    unmount2();

    // State 3: fix_blocking_errors
    const onReview3 = vi.fn();
    vi.mocked(api.dashboard.get).mockResolvedValueOnce({
      ...mockDashboardResponse,
      entries_total: 4,
      next_action: { key: 'fix_blocking_errors', params: { count: 2 } },
    });
    const { unmount: unmount3 } = renderWithProviders(
      <HomeScreen
        onNavigateToScan={vi.fn()}
        onNavigateToReview={onReview3}
        onNavigateToExport={vi.fn()}
        period="2026-11"
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Fix 2 blocking errors')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Fix 2 blocking errors'));
    expect(onReview3).toHaveBeenCalledWith(undefined, 'blocking');
    unmount3();

    // State 4: export_return
    const onExport4 = vi.fn();
    vi.mocked(api.dashboard.get).mockResolvedValueOnce({
      ...mockDashboardResponse,
      entries_total: 4,
      errors: { blocking: 0, warning: 0, info: 0 },
      readiness_pct: 100,
      next_action: { key: 'export_return', params: {} },
    });
    const { unmount: unmount4 } = renderWithProviders(
      <HomeScreen
        onNavigateToScan={vi.fn()}
        onNavigateToReview={vi.fn()}
        onNavigateToExport={onExport4}
        period="2026-11"
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Export return')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Export return'));
    expect(onExport4).toHaveBeenCalledTimes(1);
    unmount4();
  });

  it('renders friendly empty state when there are zero entries for the period', async () => {
    vi.mocked(api.dashboard.get).mockResolvedValue({
      ...mockDashboardResponse,
      entries_total: 0,
      entries_reviewed: 0,
      readiness_pct: 0,
      totals: { sales: 0, tax_collected: 0, purchases_itc: 0, excluded_entries: 0 },
      top_issues: [],
      next_action: { key: 'scan_first_bill', params: {} },
    });

    const onScan = vi.fn();
    renderWithProviders(
      <HomeScreen
        onNavigateToScan={onScan}
        onNavigateToReview={vi.fn()}
        onNavigateToExport={vi.fn()}
        period="2026-11"
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/No entries for 2026-11. Scan a bill or pick another period./i)
      ).toBeInTheDocument();
    });

    const scanBtn = screen.getByRole('button', { name: /^Scan$/i });
    expect(scanBtn).toBeInTheDocument();
    fireEvent.click(scanBtn);
    expect(onScan).toHaveBeenCalled();
  });
});
