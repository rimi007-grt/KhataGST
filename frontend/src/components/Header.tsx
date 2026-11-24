import React from 'react';
import { Shield, UserCircle, Globe } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n/I18nContext';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onOpenProfile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'KhataGST',
  subtitle,
  onOpenProfile,
}) => {
  const { user } = useAuth();
  const { language, toggleLanguage } = useTranslation();

  const handleToggleLang = () => {
    try {
      toggleLanguage();
    } catch (e) {
      console.warn('Failed to persist language in storage:', e);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-surface border-b border-border w-full">
      <div className="w-full max-w-[480px] mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand / Title & Subtitle */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 stroke-[2]" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-page-title text-ink truncate leading-tight">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-secondary text-muted truncate leading-tight">
                {subtitle}
              </p>
            ) : user ? (
              <p className="text-[12px] text-muted truncate leading-tight">
                {user.business_name || user.gstin || user.email}
              </p>
            ) : null}
          </div>
        </div>

        {/* Right Actions: Profile & Language Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {/* User Profile / Auth Button */}
          {onOpenProfile && (
            <button
              type="button"
              onClick={onOpenProfile}
              aria-label={user ? "User Profile" : "Log in / Register"}
              className={`flex items-center justify-center rounded-full transition-colors ${
                user
                  ? "w-10 h-10 hover:bg-ground/60 text-text-2"
                  : "h-9 px-3 border border-border bg-ground/50 hover:bg-ground text-primary text-xs font-semibold gap-1.5"
              }`}
            >
              <UserCircle className="w-5 h-5 stroke-[1.5]" aria-hidden="true" />
              {!user && <span>{language === 'hi' ? 'लॉगिन' : 'Log in'}</span>}
            </button>
          )}

          {/* Language Toggle: EN | हिं */}
          <button
            type="button"
            onClick={handleToggleLang}
            aria-label="Toggle language between English and Hindi"
            className="flex items-center justify-center gap-1 min-h-[44px] px-3 py-1.5 rounded-full border border-border bg-surface hover:bg-ground/60 text-ink text-secondary font-semibold transition-colors"
          >
            <Globe className="w-4 h-4 text-muted stroke-[1.75]" aria-hidden="true" />
            <span className="font-sans">{language === 'en' ? 'हिं' : 'EN'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

