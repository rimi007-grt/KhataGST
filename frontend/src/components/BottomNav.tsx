import React from 'react';
import { Home, Camera, ClipboardCheck, BarChart2, Download } from 'lucide-react';
import { useTranslation } from '../i18n/I18nContext';

export type NavTab = 'home' | 'scan' | 'review' | 'summary' | 'export';

interface BottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  blockingCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  blockingCount = 0,
}) => {
  const { t } = useTranslation();

  const tabs: { id: NavTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      id: 'home',
      label: t('nav.home') || 'Home',
      icon: <Home className="w-5 h-5 stroke-[1.75]" aria-hidden="true" />,
    },
    {
      id: 'scan',
      label: t('nav.scan') || 'Scan',
      icon: <Camera className="w-5 h-5 stroke-[1.75]" aria-hidden="true" />,
    },
    {
      id: 'review',
      label: t('nav.review') || 'Review',
      icon: <ClipboardCheck className="w-5 h-5 stroke-[1.75]" aria-hidden="true" />,
      badge: blockingCount > 0 ? blockingCount : undefined,
    },
    {
      id: 'summary',
      label: t('nav.summary') || 'Summary',
      icon: <BarChart2 className="w-5 h-5 stroke-[1.75]" aria-hidden="true" />,
    },
    {
      id: 'export',
      label: t('nav.export') || 'Export',
      icon: <Download className="w-5 h-5 stroke-[1.75]" aria-hidden="true" />,
    },
  ];

  return (
    <nav
      role="navigation"
      aria-label="Main application tabs"
      style={{ backgroundColor: 'var(--surface)', borderTopColor: 'var(--divider)' }}
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-50 bg-surface border-t border-x border-divider shadow-lg pb-[env(safe-area-inset-bottom)]"
    >
      <div
        style={{ backgroundColor: 'var(--surface)' }}
        className="w-full px-1 py-1 flex items-center justify-between h-16 bg-surface"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex items-center justify-center gap-1 min-h-[44px] sm:min-h-[48px] px-1.5 sm:px-2 py-1 rounded-full transition-colors flex-1 min-w-0 max-w-[90px] mx-0.5 ${
                isActive
                  ? 'bg-nav-pill-bg text-nav-pill-text font-bold shadow-sm'
                  : 'text-muted hover:text-ink hover:bg-ground/50'
              }`}
            >
              <div className="relative flex items-center justify-center shrink-0">
                {tab.icon}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span
                    aria-label={`${tab.badge} blocking errors`}
                    className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center bg-blocking-bg text-blocking-text border border-blocking-border"
                  >
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] sm:text-[12px] tracking-tight truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

