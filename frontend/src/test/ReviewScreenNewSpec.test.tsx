import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReturnReadinessCard } from '../components/ReturnReadinessCard';
import { SourcePhotoPanel } from '../components/SourcePhotoPanel';
import { EntryCard } from '../components/EntryCard';
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

describe('UI_SPEC Screen 2: Review Screen Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ReturnReadinessCard', () => {
    it('calculates return readiness percentage accurately from real validation results', () => {
      // 3 of 4 entries without blocking errors = 75%
      render(
        <I18nProvider>
          <ReturnReadinessCard
            totalEntries={4}
            entriesWithoutBlocking={3}
            blockingCount={1}
          />
        </I18nProvider>
      );

      expect(screen.getByText('75%')).toBeInTheDocument();
      expect(screen.getByText('Return readiness')).toBeInTheDocument();
      expect(
        screen.getByText(/3 of 4 entries have no blocking errors/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Fix 1 to unlock export/i)).toBeInTheDocument();
    });

    it('shows 100% and all clear when 0 blocking errors exist', () => {
      render(
        <I18nProvider>
          <ReturnReadinessCard
            totalEntries={5}
            entriesWithoutBlocking={5}
            blockingCount={0}
          />
        </I18nProvider>
      );

      expect(screen.getByText('100%')).toBeInTheDocument();
      expect(
        screen.getByText(/All entries compliant! Ready to export/i)
      ).toBeInTheDocument();
    });
  });

  describe('SourcePhotoPanel', () => {
    it('renders invoice photo and expands to full screen on tap', () => {
      render(
        <I18nProvider>
          <SourcePhotoPanel imageUrl="/uploads/test-invoice.jpg" />
        </I18nProvider>
      );

      const img = screen.getByAltText('Source Invoice');
      expect(img).toBeInTheDocument();

      // Tap to expand
      fireEvent.click(img);

      // Modal dialog is opened
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByAltText('Source Document Full')).toBeInTheDocument();

      // Close modal
      const closeBtn = screen.getByRole('button', { name: /Close Preview/i });
      fireEvent.click(closeBtn);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows bounding box highlight when bounding box is provided', () => {
      render(
        <I18nProvider>
          <SourcePhotoPanel
            imageUrl="/uploads/test-invoice.jpg"
            activeBox={{ x: 10, y: 20, width: 30, height: 15, label: 'Invoice No' }}
          />
        </I18nProvider>
      );

      expect(screen.getByText('Invoice No')).toBeInTheDocument();
    });
  });

  describe('EntryCard and Export Button Gating', () => {
    it('disables export button with count while any BLOCKING error exists', async () => {
      const mockEntries = [
        {
          id: 1,
          user_id: 1,
          source: 'EXTRACTED_EDITED' as const,
          entry_type: 'SALES' as const,
          invoice_no: 'INV-001',
          party_name: 'Gupta Kirana',
          total: 1000,
        },
      ];

      (api.entries.list as any).mockResolvedValue(mockEntries);
      (api.validation.validate as any).mockResolvedValue({
        period: '2023-10',
        total_entries: 1,
        blocking_count: 1,
        warning_count: 0,
        info_count: 0,
        has_blocking_errors: true,
        entries: [
          {
            entry_id: 1,
            invoice_no: 'INV-001',
            has_blocking: true,
            results: [
              {
                id: 1,
                rule_id: 'R01',
                severity: 'BLOCKING' as const,
                message: 'Invalid GSTIN format',
              },
            ],
          },
        ],
      });
      (api.validation.summary as any).mockResolvedValue({
        period: '2023-10',
        total_entries: 1,
        valid_entries: 0,
        blocking_count: 1,
        warning_count: 0,
        info_count: 0,
        has_blocking_errors: true,
      });

      render(
        <I18nProvider>
          <ReviewTable />
        </I18nProvider>
      );

      await waitFor(() => {
        const exportBtn = screen.getByRole('button', {
          name: /Export locked: 1 blocking error/i,
        });
        expect(exportBtn).toBeInTheDocument();
        expect(exportBtn).toBeDisabled();
      });
    });
  });
});

