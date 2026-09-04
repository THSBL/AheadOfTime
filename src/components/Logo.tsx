import React from 'react';

interface LogoProps {
  variant?: 'small' | 'large' | 'icon';
  className?: string;
  size?: 'normal' | 'lg' | 'xl' | '2xl';
}

export const Logo: React.FC<LogoProps> = ({ variant = 'small', className = '', size = 'normal' }) => {
  if (variant === 'icon') {
    const isLg = size === 'lg' || size === 'xl' || size === '2xl';
    return (
      <div className={`inline-flex items-center select-none ${className}`}>
        <img 
          src="/assets/AheadOfTime_Small_logo.png" 
          alt="Ahead Of Time Icon" 
          className={`${isLg ? 'w-20 h-20' : 'w-12 h-12'} object-contain rounded-2xl`} 
        />
      </div>
    );
  }

  if (variant === 'large') {
    const is2xl = size === '2xl';
    const isXl = size === 'xl' || size === 'lg';
    return (
      <div className={`inline-flex items-center select-none ${className}`}>
        <img 
          src="/assets/AheadOfTime_Large-logo-tag.png" 
          alt="Ahead Of Time Logo" 
          className={`${is2xl ? 'max-h-60 sm:max-h-80 lg:max-h-[360px]' : isXl ? 'max-h-48 sm:max-h-64 lg:max-h-80' : 'max-h-12 sm:max-h-16'} w-auto object-contain`} 
        />
      </div>
    );
  }

  // Small variant for header
  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      <img 
        src="/assets/AheadOfTime_Small_logo.png" 
        alt="Ahead Of Time Icon" 
        className="w-8 h-8 sm:w-10 sm:h-10 object-contain rounded-xl shrink-0" 
      />
      <span className="hidden sm:inline text-lg sm:text-xl font-black tracking-tight text-[#0e1d2c] whitespace-nowrap">
        Ahead<span className="text-[#529479]">Of</span>Time
      </span>
    </div>
  );
};

