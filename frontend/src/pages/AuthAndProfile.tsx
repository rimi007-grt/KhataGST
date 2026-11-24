import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { SchemeType, LanguageType } from '../types';
import { useTranslation } from '../i18n/I18nContext';
import { ShieldCheck, UserCheck, LogOut, CheckCircle, AlertCircle, Building2 } from 'lucide-react';

export const AuthAndProfile: React.FC = () => {
  const { user, login, register, updateProfile, logout } = useAuth();
  const { t, setLanguage: setGlobalLanguage } = useTranslation();

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [gstin, setGstin] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [scheme, setScheme] = useState<SchemeType>('REGULAR');
  const [language, setLanguage] = useState<LanguageType>('en');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync profile fields if user is already logged in
  useEffect(() => {
    if (user) {
      setBusinessName(user.business_name || '');
      setGstin(user.gstin || '');
      setStateCode(user.state_code || '');
      setScheme(user.scheme || 'REGULAR');
      setLanguage(user.language || 'en');
      if (user.language) {
        setGlobalLanguage(user.language);
      }
    }
  }, [user]);

  const handleSubmitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedGstin = gstin.trim().toUpperCase();
    const effectiveStateCode = stateCode.trim() || (trimmedGstin.length >= 2 ? trimmedGstin.slice(0, 2) : '');

    if (isRegister && password.length < 6) {
      setMessage({
        type: 'error',
        text: 'Password must be at least 6 characters (पासवर्ड कम से कम 6 अक्षरों का होना चाहिए)'
      });
      setLoading(false);
      return;
    }

    try {
      if (isRegister) {
        await register({
          email: trimmedEmail,
          password,
          business_name: businessName.trim() || undefined,
          gstin: trimmedGstin || undefined,
          state_code: effectiveStateCode || undefined,
          scheme,
          language
        });
        setGlobalLanguage(language);
        setMessage({ type: 'success', text: t('auth.registerSuccess') });
      } else {
        await login(trimmedEmail, password);
        setMessage({ type: 'success', text: t('auth.loginSuccess') });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Authentication failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      await updateProfile({
        business_name: businessName || undefined,
        gstin: gstin || undefined,
        state_code: stateCode || undefined,
        scheme,
        language
      });
      setGlobalLanguage(language);
      setMessage({ type: 'success', text: t('auth.profileUpdated') });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update profile' });
    } finally {
      setLoading(false);
    }
  };

  // Logged-in Business Profile View
  if (user) {
    return (
      <div className="max-w-xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">{t('auth.businessProfile')}</h1>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('auth.logout')}</span>
            </button>
          </div>

          {message && (
            <div
              className={`mt-4 p-3 rounded-lg flex items-center space-x-2 text-sm ${
                message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              }`}
            >
              {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{message.text}</span>
            </div>
          )}

          <form onSubmit={handleUpdateProfile} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                {t('auth.businessName')}
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Rastogi Enterprises"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {t('auth.gstin')}
                </label>
                <input
                  type="text"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="e.g. 07AAAAA0000A1Z5"
                  maxLength={15}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {t('auth.stateCode')}
                </label>
                <input
                  type="text"
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                  placeholder="e.g. 07"
                  maxLength={2}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {t('auth.scheme')}
                </label>
                <select
                  value={scheme}
                  onChange={(e) => setScheme(e.target.value as SchemeType)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                >
                  <option value="REGULAR">Regular (Monthly GSTR-1 & 3B)</option>
                  <option value="QRMP">QRMP (Quarterly Filing)</option>
                  <option value="COMPOSITION">Composition (CMP-08)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {t('auth.language')}
                </label>
                <select
                  value={language}
                  onChange={(e) => {
                    const l = e.target.value as LanguageType;
                    setLanguage(l);
                    setGlobalLanguage(l);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                >
                  <option value="en">English</option>
                  <option value="hi">हिंदी (Hindi)</option>
                </select>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition disabled:opacity-50 text-sm flex items-center justify-center space-x-2"
              >
                <UserCheck className="w-4 h-4" />
                <span>{loading ? t('auth.saving') : t('auth.saveProfile')}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Not logged in: Login / Register Form
  return (
    <div className="max-w-md mx-auto p-4 sm:p-6 space-y-6">
      <div className="text-center space-y-1">
        <div className="inline-flex p-3 bg-blue-600 text-white rounded-2xl shadow-md mb-2">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">{t('auth.title')}</h1>
        <p className="text-sm text-slate-600">{t('auth.subtitle')}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex border-b border-slate-200 mb-6">
          <button
            type="button"
            onClick={() => { setIsRegister(false); setMessage(null); }}
            className={`flex-1 py-2.5 text-sm font-semibold text-center border-b-2 transition ${
              !isRegister ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t('auth.signInTab')}
          </button>
          <button
            type="button"
            onClick={() => { setIsRegister(true); setMessage(null); }}
            className={`flex-1 py-2.5 text-sm font-semibold text-center border-b-2 transition ${
              isRegister ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t('auth.registerTab')}
          </button>
        </div>

        {message && (
          <div
            className={`mb-4 p-3 rounded-lg flex items-center space-x-2 text-sm ${
              message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}
          >
            {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmitAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {t('auth.email')} *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trader@example.com"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {t('auth.password')} *
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            {isRegister && (
              <p className="text-[11px] text-slate-500 mt-1">
                Minimum 6 characters (पासवर्ड कम से कम 6 अक्षरों का रखें)
              </p>
            )}
          </div>

          {isRegister && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {t('auth.businessName')}
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Krishna Kirana Store"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    {t('auth.gstin')}
                  </label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setGstin(val);
                      if (!stateCode && val.length >= 2) {
                        setStateCode(val.slice(0, 2));
                      }
                    }}
                    placeholder="07AAAAA0000A1Z5"
                    maxLength={15}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    {t('auth.stateCode')}
                  </label>
                  <input
                    type="text"
                    value={stateCode}
                    onChange={(e) => setStateCode(e.target.value)}
                    placeholder="07"
                    maxLength={2}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    {t('auth.scheme')}
                  </label>
                  <select
                    value={scheme}
                    onChange={(e) => setScheme(e.target.value as SchemeType)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="REGULAR">Regular</option>
                    <option value="QRMP">QRMP</option>
                    <option value="COMPOSITION">Composition</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    {t('auth.language')}
                  </label>
                  <select
                    value={language}
                    onChange={(e) => {
                      const l = e.target.value as LanguageType;
                      setLanguage(l);
                      setGlobalLanguage(l);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="en">English</option>
                    <option value="hi">हिंदी</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition disabled:opacity-50 text-sm"
            >
              {loading ? 'Please wait...' : isRegister ? t('auth.registerTab') : t('auth.signInTab')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
