import React from 'react';
import { User, Upload, Table, FileSpreadsheet, ShieldCheck, Languages } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n/I18nContext';

export type ScreenTab = 'auth' | 'upload' | 'review' | 'export';

interface NavbarProps {
  currentTab: ScreenTab;
  onSelectTab: (tab: ScreenTab) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onSelectTab }) => {
  const { user } = useAuth();
  const { t, language, toggleLanguage } = useTranslation();

  const tabs: { id: ScreenTab; label: string; icon: React.ReactNode }[] = [
    { id: 'auth', label: user ? t('nav.profile') : t('nav.signIn'), icon: <User className="w-5 h-5" /> },
    { id: 'upload', label: t('nav.upload'), icon: <Upload className="w-5 h-5" /> },
    { id: 'review', label: t('nav.review'), icon: <Table className="w-5 h-5" /> },
    { id: 'export', label: t('nav.export'), icon: <FileSpreadsheet className="w-5 h-5" /> },
  ];

  return (
    <>
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-blue-600 text-white rounded-lg shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="font-black text-lg text-slate-900 tracking-tight">KhataGST</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              {t('nav.pwa')}
            </span>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                  currentTab === tab.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* User Status pill & Live Language Toggle */}
          <div className="flex items-center space-x-2.5 text-xs">
            {/* Live Language Switcher Button */}
            <button
              type="button"
              onClick={toggleLanguage}
              aria-label="Toggle language"
              className="flex items-center space-x-1 px-2.5 py-1 rounded-full border border-slate-300 hover:border-blue-400 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-semibold text-xs transition"
            >
              <Languages className="w-3.5 h-3.5" />
              <span>{language === 'en' ? 'हिन्दी' : 'English'}</span>
            </button>

            {user ? (
              <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-slate-100 rounded-full text-slate-700 font-mono text-[11px]">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>{user.gstin ? user.gstin : user.email.split('@')[0]}</span>
              </div>
            ) : (
              <button
                onClick={() => onSelectTab('auth')}
                className="text-blue-600 font-semibold hover:underline text-xs hidden sm:inline"
              >
                {t('nav.signIn')}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 px-2 py-1.5 flex justify-around shadow-lg">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg text-[10px] font-medium transition ${
              currentTab === tab.id
                ? 'text-blue-600 font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.icon}
            <span className="mt-0.5">{tab.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
};
