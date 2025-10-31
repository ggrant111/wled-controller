'use client';

import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function Toggle({ 
  checked, 
  onChange, 
  label, 
  className = '',
  size = 'md'
}: ToggleProps) {
  const sizeClasses = {
    sm: { container: 'w-10 h-5', circle: 'w-4 h-4', translate: 'translate-x-[22px]' },
    md: { container: 'w-12 h-6', circle: 'w-5 h-5', translate: 'translate-x-[26px]' },
    lg: { container: 'w-14 h-7', circle: 'w-6 h-6', translate: 'translate-x-[30px]' }
  };

  const sizes = sizeClasses[size];

  const toggle = (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`${sizes.container} rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-transparent ${
        checked
          ? 'bg-primary-500'
          : 'bg-white/20'
      } ${className}`}
      role="switch"
      aria-checked={checked}
    >
      <div className={`${sizes.circle} bg-white rounded-full transition-transform ${
        checked
          ? `${sizes.translate}`
          : 'translate-x-0.5'
      }`} />
    </button>
  );

  if (label) {
    return (
      <label className="flex items-center gap-2 text-sm text-white/90 cursor-pointer">
        {toggle}
        <span>{label}</span>
      </label>
    );
  }

  return toggle;
}

