import React from 'react';
import { ValidationFinding, SeverityType } from '../types';
import { X, AlertOctagon, AlertTriangle, Info, CheckCircle, Languages } from 'lucide-react';
import { useTranslation } from '../i18n/I18nContext';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceNo?: string | null;
  findings: ValidationFinding[];
}

export const ErrorModal: React.FC<ErrorModalProps> = ({
  isOpen,
  onClose,
  invoiceNo,
  findings
}) => {
  const { t, language, toggleLanguage } = useTranslation();

  if (!isOpen) return null;

  const getSeverityBadge = (severity: SeverityType) => {
    switch (severity) {
      case 'BLOCKING':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>BLOCKING</span>
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>WARNING</span>
          </span>
        );
      case 'INFO':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            <Info className="w-3.5 h-3.5" />
            <span>INFO</span>
          </span>
        );
    }
  };

  const getTranslatedMessage = (item: ValidationFinding): string => {
    // If message_key exists, translate with parameters
    if (item.message_key) {
      const translated = t(`rules.${item.message_key}`, item.message_params || {});
      if (translated && translated !== `rules.${item.message_key}`) {
        return translated;
      }
    }
    return item.message || '';
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-800">
              {t('modal.title')}
            </h3>
            <p className="text-xs text-slate-500">
              {t('modal.invoice')}{' '}
              <span className="font-mono font-medium text-slate-700">{invoiceNo || 'N/A'}</span>
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {/* Modal Language Toggle */}
            <button
              type="button"
              onClick={toggleLanguage}
              className="flex items-center space-x-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 transition"
              title="Switch language"
            >
              <Languages className="w-3 h-3 text-blue-600" />
              <span>{language === 'en' ? 'हिन्दी' : 'English'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-3">
          {findings.length === 0 ? (
            <div className="py-8 text-center text-emerald-700">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
              <p className="font-semibold text-sm">{t('modal.noErrors')}</p>
              <p className="text-xs text-slate-500 mt-1">{t('modal.passAllChecks')}</p>
            </div>
          ) : (
            findings.map((item, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-xl border text-sm space-y-2 ${
                  item.severity === 'BLOCKING'
                    ? 'bg-red-50/70 border-red-200'
                    : item.severity === 'WARNING'
                    ? 'bg-amber-50/70 border-amber-200'
                    : 'bg-blue-50/70 border-blue-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-xs px-2 py-0.5 bg-white rounded border border-slate-200 text-slate-700">
                      {item.rule_id}
                    </span>
                    {getSeverityBadge(item.severity)}
                  </div>
                </div>

                <div className="text-slate-800 font-medium text-xs sm:text-sm leading-relaxed">
                  {getTranslatedMessage(item)}
                </div>

                {item.message_params && Object.keys(item.message_params).length > 0 && (
                  <div className="text-[11px] font-mono text-slate-600 bg-white/80 p-2 rounded border border-slate-200/60">
                    {Object.entries(item.message_params).map(([k, v]) => (
                      <div key={k}>
                        <span className="font-semibold text-slate-500">{k}:</span> {String(v)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            {t('modal.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
