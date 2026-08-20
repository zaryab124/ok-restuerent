'use client';

import React from 'react';
import Image from 'next/image';
import { UtensilsCrossed } from 'lucide-react';

interface LogoProps {
  customLogoUrl?: string; // Client can pass their uploaded logo URL here anytime!
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Logo: React.FC<LogoProps> = ({ customLogoUrl, className = '', size = 'md' }) => {
  const dimensions = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10 sm:w-12 sm:h-12',
    lg: 'w-16 h-16',
  }[size];

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5 sm:w-6 sm:h-6',
    lg: 'w-8 h-8',
  }[size];

  const textSizes = {
    sm: 'text-base',
    md: 'text-lg sm:text-2xl',
    lg: 'text-3xl sm:text-4xl',
  }[size];

  return (
    <div className={`flex items-center gap-3 group ${className}`}>
      <div className={`${dimensions} rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 p-0.5 shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform flex-shrink-0 relative overflow-hidden`}>
        <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
          {customLogoUrl ? (
            <Image
              src={customLogoUrl}
              alt="OK Restaurant Logo"
              fill
              className="object-contain p-1"
            />
          ) : (
            <UtensilsCrossed className={`${iconSizes} text-amber-400`} />
          )}
        </div>
      </div>
      <div>
        <span className={`${textSizes} font-black tracking-tight text-white flex items-center gap-1 leading-none`}>
          OK <span className="text-amber-400">RESTAURANT</span>
        </span>
        <span className="text-[10px] sm:text-xs block text-slate-400 font-medium mt-0.5">
          Taste that brings you back
        </span>
      </div>
    </div>
  );
};
