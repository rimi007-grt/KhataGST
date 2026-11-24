import React, { useState } from 'react';
import { Maximize2, X, ZoomIn, ZoomOut, Image as ImageIcon } from 'lucide-react';
import { useTranslation } from '../i18n/I18nContext';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

interface SourcePhotoPanelProps {
  imageUrl?: string | null;
  activeBox?: BoundingBox | null;
  onSelectField?: (field: string) => void;
  className?: string;
}

export const SourcePhotoPanel: React.FC<SourcePhotoPanelProps> = ({
  imageUrl,
  activeBox,
  className = '',
}) => {
  const { t } = useTranslation();
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [imageError, setImageError] = useState(false);

  React.useEffect(() => {
    setImageError(false);
  }, [imageUrl]);

  const hasValidBoundingBox = (box?: BoundingBox | null): boolean => {
    if (!box) return false;
    return (
      typeof box.x === 'number' &&
      typeof box.y === 'number' &&
      typeof box.width === 'number' &&
      typeof box.height === 'number' &&
      box.width > 0 &&
      box.height > 0
    );
  };

  const hasImage = Boolean(imageUrl) && !imageError;

  return (
    <>
      {/* Inline Source Photo Panel (~132px height on mobile per spec) */}
      <div
        className={`relative w-full h-[132px] rounded-xl overflow-hidden border border-border bg-photo-paper shadow-sm ${className}`}
      >
        {hasImage ? (
          <div
            onClick={() => setIsFullScreen(true)}
            className="w-full h-full relative cursor-pointer group"
            title="Tap to expand invoice image"
          >
            <img
              src={imageUrl!}
              alt="Source Invoice"
              onError={() => setImageError(true)}
              className="w-full h-full object-cover object-top transition-transform duration-200 group-hover:scale-105"
            />

            {/* Bounding box highlight (ONLY if extraction provider returned real box) */}
            {hasValidBoundingBox(activeBox) && (
              <div
                style={{
                  left: `${activeBox!.x}%`,
                  top: `${activeBox!.y}%`,
                  width: `${activeBox!.width}%`,
                  height: `${activeBox!.height}%`,
                }}
                className="absolute border-2 border-hl-border bg-hl-fill pointer-events-none transition-all duration-300"
              >
                {activeBox!.label && (
                  <span className="absolute -top-4 left-0 text-[10px] bg-hl-label-bg text-white px-1 py-0.2 rounded font-medium shadow-sm">
                    {activeBox!.label}
                  </span>
                )}
              </div>
            )}

            {/* Tap to expand overlay pill */}
            <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 bg-surface/90 text-ink rounded-full text-[11px] font-semibold border border-border shadow-sm">
              <Maximize2 className="w-3 h-3 text-muted" aria-hidden="true" />
              <span>Expand</span>
            </div>
          </div>
        ) : (
          /* Placeholder Card ("No source image") when image missing or failed to load */
          <div
            data-testid="no-source-image-placeholder"
            className="w-full h-full flex flex-col items-center justify-center p-3 bg-surface/50 border border-dashed border-border text-center rounded-xl"
          >
            <ImageIcon className="w-6 h-6 text-muted mb-1 stroke-[1.5]" aria-hidden="true" />
            <p className="text-xs font-semibold text-ink">
              No source image
            </p>
            <p className="text-[11px] text-muted">
              {t('review.noPhotoPreview') || 'Digital Ledger Paper View'}
            </p>
          </div>
        )}
      </div>

      {/* Full-Screen Zoom Modal */}
      {isFullScreen && hasImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/85 flex flex-col p-4 animate-in fade-in duration-200"
        >
          {/* Top Control Bar */}
          <div className="flex items-center justify-between text-white pb-3 border-b border-white/20">
            <span className="text-body font-bold">Source Invoice Document</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(z + 0.25, 2.5))}
                aria-label="Zoom In"
                className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(z - 0.25, 0.75))}
                aria-label="Zoom Out"
                className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsFullScreen(false);
                  setZoomLevel(1);
                }}
                aria-label="Close Preview"
                className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Interactive Zoomable View Area */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-2">
            <div
              style={{ transform: `scale(${zoomLevel})` }}
              className="relative transition-transform duration-200 max-w-full"
            >
              <img
                src={imageUrl!}
                alt="Source Document Full"
                className="max-h-[80vh] w-auto rounded shadow-2xl"
              />

              {hasValidBoundingBox(activeBox) && (
                <div
                  style={{
                    left: `${activeBox!.x}%`,
                    top: `${activeBox!.y}%`,
                    width: `${activeBox!.width}%`,
                    height: `${activeBox!.height}%`,
                  }}
                  className="absolute border-2 border-hl-border bg-hl-fill pointer-events-none"
                >
                  {activeBox!.label && (
                    <span className="absolute -top-5 left-0 text-[11px] bg-hl-label-bg text-white px-1.5 py-0.5 rounded font-semibold">
                      {activeBox!.label}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

