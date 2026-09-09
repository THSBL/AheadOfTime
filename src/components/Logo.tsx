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
          className={`${isLg ? 'w-20 h-20' : 'w-12 h-12'} object-contain rounded-2xl`} 
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
      ? 'h-24 sm:h-32 md:h-40'
      : isXl
      ? 'h-20 sm:h-28'
      : isLg
      ? 'h-14 sm:h-16 md:h-20'
      : isSm
      ? 'h-8 sm:h-9'
      : 'h-10 sm:h-12 md:h-14';

    return (
      <div className={`inline-flex items-center select-none ${className}`}>
        <img 
          src={largeImgSrc} 
          alt="Ahead Of Time Logo" 
          onError={() => setLargeImgSrc('/assets/AheadOfTime_Large-logo-tag (1).png')}
          className={`${heightClass} w-auto object-contain shrink-0 max-w-[280px] sm:max-w-[360px] md:max-w-none`} 
        />
      </div>
    );
  }

  // Small / Dark variant
  const isDark = variant === 'dark';
  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      <img 
        src={smallImgSrc} 
        alt="Ahead Of Time Icon" 
        className="w-8 h-8 sm:w-10 sm:h-10 object-contain rounded-xl shrink-0" 
      />
      <span className={`hidden sm:inline text-lg sm:text-xl font-black tracking-tight ${isDark ? 'text-white' : 'text-[#0e1d2c]'} whitespace-nowrap`}>
        Ahead <span className="text-[#447463]">Of</span> Time
      </span>
    </div>
  );
};


