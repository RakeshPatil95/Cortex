import { NextResponse } from 'next/server';
import { withAuth } from 'next-auth/middleware';

const locales = ['ar', 'en'];
const defaultLocale = 'ar';

// Get the preferred locale
function getLocale(request) {
  // Check if there's a locale in the pathname
  const { pathname } = request.nextUrl;
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameHasLocale) {
    return pathname.split('/')[1];
  }

  // Check Accept-Language header
  const acceptLanguage = request.headers.get('accept-language');
  if (acceptLanguage) {
    const languages = acceptLanguage
      .split(',')
      .map(lang => lang.split(';')[0].trim().toLowerCase());
    
    // Check for Arabic
    if (languages.some(lang => lang.startsWith('ar'))) {
      return 'ar';
    }
    
    // Check for English
    if (languages.some(lang => lang.startsWith('en'))) {
      return 'en';
    }
  }

  return defaultLocale;
}

export function middleware(request) {
  const { pathname } = request.nextUrl;
  
  // Skip if pathname starts with _next, api, or static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // Check if there is any supported locale in the pathname
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (!pathnameHasLocale) {
    // Redirect if there is no locale
    const locale = getLocale(request);
    const newUrl = new URL(`/${locale}${pathname}`, request.url);
    return NextResponse.redirect(newUrl);
  }

  // Check if this is a protected route
  const isProtectedRoute = pathname.includes('/dashboard') || 
                          pathname.includes('/search') || 
                          pathname.includes('/chat');

  if (isProtectedRoute) {
    // Apply auth middleware only to protected routes
    return withAuth(
      function middleware(req) {
        // Add any additional middleware logic here
      },
      {
        callbacks: {
          authorized: ({ token }) => !!token,
        },
      }
    )(request);
  }

  // For non-protected routes (like login), just continue
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip all internal paths (_next)
    '/((?!_next|api|favicon.ico).*)',
  ],
};
