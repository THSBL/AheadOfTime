import React, { useState } from 'react';

interface LogoProps {
  variant?: 'small' | 'large' | 'icon' | 'header' | 'dark';
  className?: string;
  size?: 'sm' | 'normal' | 'lg' | 'xl' | '2xl';
}

export const Logo: React.FC<LogoProps> = ({ variant = 'large', className = '', size = 'normal' }) => {
  const [largeImgSrc, setLargeImgSrc] = useState('/assets/AheadOfTime_Large-logo-tag.png');
  const [smallImgSrc, setSmallImgSrc] = useState('/assets/AheadOfTime_Small_logo.png');

  if (variant === 'icon') {
    const isLg = size === 'lg' || size === 'xl' || size === '2xl';
    return (
      <div className={`inline-flex items-center select-none ${className}`}>
        <img 
          src={smallImgSrc} 
          alt="Ahead Of Time Icon" 
          onError={() => setSmallImgSrc('/assets/AheadOfTime_Small_logo.png')}
          className={`${isLg ? 'w-16 h-16' : 'w-10 h-10'} object-contain rounded-xl`} 
        />
      </div>
    );
  }

  if (variant === 'large' || variant === 'header') {
    const is2xl = size === '2xl';
    const isXl = size === 'xl';
    const isLg = size === 'lg';
    const isSm = size === 'sm';

    const heightClass = is2xl
      ? 'h-20 sm:h-28 md:h-32'
      : isXl
      ? 'h-16 sm:h-22'
      : isLg
      ? 'h-12 sm:h-14 md:h-16'
      : isSm
      ? 'h-7 sm:h-8'
      : 'h-9 sm:h-10 md:h-12';

    return (
      <div className={`inline-flex items-center select-none ${className}`}>
        <img 
          src={largeImgSrc} 
          alt="Ahead Of Time Logo" 
          onError={() => setLargeImgSrc('/assets/AheadOfTime_Large-logo-tag (1).png')}
          className={`${heightClass} w-auto object-contain shrink-0 max-w-[260px] sm:max-w-[340px] md:max-w-none`} 
        />
      </div>
    );
  }

  // Small / Dark / Header inline title + logo variant
  const isDark = variant === 'dark';

  const imgSize = size === 'sm'
    ? 'w-6 h-6 sm:w-7 sm:h-7'
    : size === 'lg'
    ? 'w-8 h-8 sm:w-9 sm:h-9'
    : size === 'xl'
    ? 'w-10 h-10 sm:w-12 sm:h-12'
    : size === '2xl'
    ? 'w-12 h-12 sm:w-16 sm:h-16'
    : 'w-7 h-7 sm:w-8 sm:h-8';

  const textSize = size === 'sm'
    ? 'text-xs sm:text-sm'
    : size === 'lg'
    ? 'text-base sm:text-lg'
    : size === 'xl'
    ? 'text-lg sm:text-xl'
    : size === '2xl'
    ? 'text-xl sm:text-2xl'
    : 'text-sm sm:text-base';

  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      <div className="flex items-center justify-center shrink-0">
        <img 
          src={smallImgSrc} 
          alt="Ahead Of Time Icon" 
          onError={() => setSmallImgSrc('/assets/AheadOfTime_Small_logo.png')}
          className={`${imgSize} object-contain rounded-lg shrink-0`} 
        />
      </div>
      <span className={`inline-flex items-center font-extrabold tracking-tight leading-none ${textSize} ${isDark ? 'text-white' : 'text-[#0e1d2c]'} whitespace-nowrap`}>
        Ahead&nbsp;<span className="text-[#447463]">Of</span>&nbsp;Time
      </span>
    </div>
  );
};



