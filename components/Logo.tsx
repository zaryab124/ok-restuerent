'use client';

import React from 'react';
import Image from 'next/image';

interface LogoProps {
  customLogoUrl?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSlogan?: boolean;
  variant?: 'full' | 'compact' | 'badge';
}

export const Logo: React.FC<LogoProps> = ({
  customLogoUrl = '/images/logo.png',
  className = '',
  size = 'md',
  showSlogan = true,
  variant = 'full',
}) => {
  const iconDimensions = {
    sm: 'w-9 h-9',
    md: 'w-11 h-11 sm:w-12 sm:h-12',
    lg: 'w-16 h-16 sm:w-20 sm:h-20',
    xl: 'w-24 h-24 sm:w-28 sm:h-28',
  }[size];

  const titleSizes = {
    sm: 'text-sm font-black',
    md: 'text-base sm:text-xl font-black',
    lg: 'text-2xl sm:text-3xl font-black',
    xl: 'text-3xl sm:text-4xl font-black',
  }[size];

  const sloganSizes = {
    sm: 'text-[9px]',
    md: 'text-[11px] sm:text-xs',
    lg: 'text-xs sm:text-sm',
    xl: 'text-sm sm:text-base',
  }[size];

  if (variant === 'badge') {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <div className={`${iconDimensions} relative rounded-2xl overflow-hidden shadow-2xl border border-amber-500/40 p-0.5 bg-slate-950 mb-2.5`}>
          <Image
            src={customLogoUrl}
            alt="OK Restaurant Emblem"
            width={120}
            height={120}
            className="w-full h-full object-cover rounded-xl"
            priority
          />
        </div>
        <span className={`${titleSizes} tracking-tight text-white flex items-center gap-1 leading-none`}>
          OK <span className="text-amber-400">RESTAURANT</span>
        </span>
        {showSlogan && (
          <span className={`${sloganSizes} text-amber-300/90 font-medium tracking-wide mt-1.5 font-serif italic`}>
            “Ap OK Karien, Bas”
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 group ${className}`}>
      {/* Official Emblem */}
      <div className={`${iconDimensions} rounded-xl p-0.5 bg-gradient-to-tr from-amber-500 via-amber-400 to-amber-600 shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform flex-shrink-0 relative overflow-hidden`}>
        <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center overflow-hidden">
          <Image
            src={customLogoUrl}
            alt="OK Restaurant Emblem"
            width={80}
            height={80}
            className="w-full h-full object-cover"
            priority
          />
        </div>
      </div>

      {/* Brand Name & Slogan */}
      <div>
        <span className={`${titleSizes} tracking-tight text-white flex items-center gap-1.5 leading-none`}>
          OK <span className="text-amber-400">RESTAURANT</span>
        </span>
        {showSlogan && (
          <span className={`${sloganSizes} block text-amber-300/90 font-semibold tracking-wide mt-1 italic font-serif`}>
            “Ap OK Karien, Bas”
          </span>
        )}
      </div>
    </div>
  );
};
