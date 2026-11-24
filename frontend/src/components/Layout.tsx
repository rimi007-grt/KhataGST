import React from 'react';
import { Header } from './Header';
import { GlobalBanners } from './GlobalBanners';
import { ColdStartBanner } from './ColdStartBanner';
import { BottomNav, NavTab } from './BottomNav';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  title?: string;
  subtitle?: string;
  onOpenProfile?: () => void;
  blockingCount?: number;
  rateTableVersion?: string | null;
  ratesVerified?: boolean;
  isDemo?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  activeTab,
  onSelectTab,
  title,
  subtitle,
  onOpenProfile,
  blockingCount = 0,
  rateTableVersion = '2023-10-01',
  ratesVerified = false,
  isDemo = true,
}) => {
  return (
    <div className="min-h-screen bg-ground text-ink flex flex-col antialiased">
      {/* Mobile-first centered container: max-w-[480px] on desktop, full width on mobile */}
      <div className="w-full max-w-[480px] mx-auto flex flex-col flex-1 bg-surface min-h-screen shadow-sm border-x border-border relative">
        {/* Top Header */}
        <Header
          title={title}
          subtitle={subtitle}
          onOpenProfile={onOpenProfile}
        />

        {/* Global Compliance Banners (always visible where tax data appears) */}
        <GlobalBanners
          isDemo={isDemo}
          rateTableVersion={rateTableVersion}
          ratesVerified={ratesVerified}
        />

        {/* Cold Start Banner (shown only if backend takes > 3s to respond on wake-up) */}
        <ColdStartBanner />

        {/* Main Content Area - pb equal to bottom nav height (64px) + 16px buffer + safe-area */}
        <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] px-3 py-3 overflow-y-auto">
          {children}
        </main>

        {/* Bottom Navigation (4 Tabs: Scan, Review, Summary, Export) */}
        <BottomNav
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          blockingCount={blockingCount}
        />
      </div>
    </div>
  );
};

