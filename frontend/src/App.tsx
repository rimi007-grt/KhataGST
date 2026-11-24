import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { I18nProvider } from './i18n/I18nContext';
import { Layout } from './components/Layout';
import { NavTab } from './components/BottomNav';
import { AuthAndProfile } from './pages/AuthAndProfile';
import { HomeScreen } from './pages/HomeScreen';
import { Upload } from './pages/Upload';
import { ReviewTable } from './pages/ReviewTable';
import { SummaryAndExport } from './pages/SummaryAndExport';
import { SummaryScreen } from './pages/SummaryScreen';
import { ExportScreen } from './pages/ExportScreen';
import { ArrowLeft } from 'lucide-react';

export const AppContent: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab') as NavTab | null;
      if (tabParam && ['home', 'scan', 'review', 'summary', 'export'].includes(tabParam)) {
        return tabParam;
      }
      const hash = window.location.hash.replace('#', '') as NavTab;
      if (['home', 'scan', 'review', 'summary', 'export'].includes(hash)) {
        return hash;
      }
    }
    return 'home';
  });
  const [showProfile, setShowProfile] = useState(false);
  const [globalPeriod, setGlobalPeriod] = useState<string>('2026-11');
  const [reviewInitialFilter, setReviewInitialFilter] = useState<'all' | 'blocking'>('all');

  // Derive Period and Scheme subtitle for header
  const rawScheme = user?.scheme || 'REGULAR';
  const schemeName = rawScheme.toUpperCase() === 'REGULAR' ? 'Regular' : (rawScheme.toUpperCase() === 'COMPOSITION' ? 'Composition' : rawScheme);
  const headerSubtitle = `Period: ${globalPeriod} • ${schemeName} scheme`;

  const handleNavigateToReview = (entryId?: number, filter?: 'all' | 'blocking') => {
    setReviewInitialFilter(filter || 'all');
    setActiveTab('review');
  };

  return (
    <Layout
      activeTab={activeTab}
      onSelectTab={(tab) => {
        setShowProfile(false);
        setActiveTab(tab);
      }}
      title="KhataGST"
      subtitle={headerSubtitle}
      onOpenProfile={() => setShowProfile((prev) => !prev)}
      isDemo={true}
      rateTableVersion="2023-10-01"
      ratesVerified={false}
    >
      {showProfile ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setShowProfile(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-surface text-ink text-secondary font-semibold hover:bg-ground transition-colors"
          >
            <ArrowLeft className="w-4 h-4 stroke-[2]" />
            <span>Back to Dashboard</span>
          </button>
          <AuthAndProfile />
        </div>
      ) : (
        <>
          {activeTab === 'home' && (
            <HomeScreen
              period={globalPeriod}
              onPeriodChange={setGlobalPeriod}
              onNavigateToScan={() => setActiveTab('scan')}
              onNavigateToReview={handleNavigateToReview}
              onNavigateToExport={() => setActiveTab('export')}
              onOpenAuth={() => setShowProfile(true)}
            />
          )}
          {activeTab === 'scan' && (
            <Upload onNavigateToReview={() => setActiveTab('review')} />
          )}
          {activeTab === 'review' && (
            <ReviewTable onNavigateToExport={() => setActiveTab('export')} />
          )}
          {activeTab === 'summary' && (
            <SummaryScreen onNavigateToReview={() => setActiveTab('review')} />
          )}
          {activeTab === 'export' && (
            <ExportScreen
              onNavigateToReview={() => setActiveTab('review')}
              onNavigateToScan={() => setActiveTab('scan')}
            />
          )}
        </>
      )}
    </Layout>
  );
};

export const App: React.FC = () => {
  return (
    <I18nProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </I18nProvider>
  );
};

export default App;
