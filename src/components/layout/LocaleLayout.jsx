'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function LocaleLayout({ children }) {
  const pathname = usePathname();
  
  // Extract locale from pathname - now expects /[lang]/path format
  const locale = (() => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length > 0 && ['ar', 'en'].includes(segments[0])) {
      return segments[0];
    }
    return 'ar'; // Default to Arabic
  })();

  useEffect(() => {
    // Update document direction based on locale
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
  }, [locale]);

  return <>{children}</>;
}
