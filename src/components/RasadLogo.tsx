import React from 'react';
import type { Language } from '../types';

interface RasadLogoProps {
  lang?: Language;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  layout?: 'horizontal' | 'centered';
  showWordmark?: boolean;
  subtitle?: string;
}

export const RasadLogo: React.FC<RasadLogoProps> = ({
  lang = 'ar',
  size = 'md',
  layout = 'horizontal',
  showWordmark = true,
  subtitle,
}) => {
  const iconDim =
    size === 'xl'
      ? 'w-16 h-16 sm:w-20 sm:h-20'
      : size === 'lg'
      ? 'w-14 h-14'
      : size === 'sm'
      ? 'w-9 h-9'
      : 'w-11 h-11';

  const titleSize =
    size === 'xl'
      ? 'text-2xl sm:text-3xl'
      : size === 'lg'
      ? 'text-2xl sm:text-3xl'
      : size === 'sm'
      ? 'text-lg'
      : 'text-xl';

  const isCentered = layout === 'centered';

  return (
    <div
      className={`inline-flex select-none ${
        isCentered ? 'flex-col items-center text-center gap-3' : 'items-center gap-3.5'
      }`}
    >
      <div
        className={`${iconDim} rounded-2xl bg-[#111827] flex items-center justify-center shadow-md border border-slate-800 shrink-0 relative overflow-hidden`}
      >
        <svg viewBox="0 0 64 64" className="w-[82%] h-[82%]" aria-hidden="true">
          {/* Outer protective shield polygon */}
          <path
            d="M32 6 L54 14 V31 C54 44.5 44.5 54 32 58 C19.5 54 10 44.5 10 31 V14 Z"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.8"
            strokeLinejoin="round"
          />
          {/* Passive RF radar arcs */}
          <path
            d="M21 24 A14 14 0 0 1 43 24"
            fill="none"
            stroke="#E05252"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M25.5 29 A8.5 8.5 0 0 1 38.5 29"
            fill="none"
            stroke="#E05252"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          {/* High-voltage electrical pulse bolt */}
          <path
            d="M34 25 L26 37 H32.5 L30 48 L39 35 H32.5 Z"
            fill="#E05252"
            stroke="#FFFFFF"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {showWordmark && (
        <div className="leading-tight">
          <div className={`font-display ${titleSize} font-extrabold tracking-tight text-slate-900`}>
            {lang === 'ar' ? 'رَصَد | RASAD' : 'RASAD | رَصَد'}
          </div>
          {subtitle && (
            <div className="text-xs sm:text-sm font-bold text-slate-500 mt-1">{subtitle}</div>
          )}
        </div>
      )}
    </div>
  );
};
