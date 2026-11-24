import React, { createContext, useContext, useState, useEffect } from 'react';
import en from './en.json';
import hi from './hi.json';
import { LanguageType } from '../types';

type TranslationCatalog = Record<string, any>;

interface I18nContextType {
  language: LanguageType;
  setLanguage: (lang: LanguageType) => void;
  toggleLanguage: () => void;
  t: (key: string, params?: Record<string, any>) => string;
}

const catalogs: Record<LanguageType, TranslationCatalog> = {
  en,
  hi,
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageType>(() => {
    try {
      const saved = localStorage.getItem('khatagst_lang');
      return (saved === 'hi' || saved === 'en') ? saved : 'en';
    } catch (e) {
      console.warn('Failed to read language from localStorage:', e);
      return 'en';
    }
  });

  const setLanguage = (lang: LanguageType) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('khatagst_lang', lang);
    } catch (e) {
      console.warn('Failed to write language to localStorage:', e);
    }
  };

  const toggleLanguage = () => {
    const next = language === 'en' ? 'hi' : 'en';
    setLanguage(next);
  };

  const resolveKey = (catalog: TranslationCatalog, key: string): string | undefined => {
    // 1. Direct key match (e.g. "R01_INVALID_FORMAT")
    if (typeof catalog[key] === 'string') {
      return catalog[key];
    }
    // 2. Direct key in rules sub-object (e.g. "R01_INVALID_FORMAT" in rules)
    if (catalog.rules && typeof catalog.rules[key] === 'string') {
      return catalog.rules[key];
    }
    // 3. Dot notation (e.g. "nav.upload" or "rules.R01_INVALID_FORMAT")
    const parts = key.split('.');
    let curr = catalog;
    for (const part of parts) {
      if (curr && typeof curr === 'object' && part in curr) {
        curr = curr[part];
      } else {
        return undefined;
      }
    }
    return typeof curr === 'string' ? curr : undefined;
  };

  const t = (key: string, params?: Record<string, any>): string => {
    const currentCatalog = catalogs[language] || catalogs.en;
    let template = resolveKey(currentCatalog, key);

    // Fallback to English if missing in current language
    if (!template && language !== 'en') {
      template = resolveKey(catalogs.en, key);
    }

    if (!template) {
      return key;
    }

    // Substitute {param}
    if (params) {
      return template.replace(/\{(\w+)\}/g, (_, match) => {
        return params[match] !== undefined ? String(params[match]) : `{${match}}`;
      });
    }

    return template;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
};

