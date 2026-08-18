'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Sidebar from './Sidebar';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useTranslations } from '@/lib/translations';

export default function MainLayout({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t, isRTL, locale } = useTranslations();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`/${locale}/auth/login`);
    }
  }, [status, router, locale]);

  if (status === 'loading') {
    return <LoadingSpinner message={t('auth.loading')} />;
  }

  if (status === 'unauthenticated') {
    return null; // Will redirect to login
  }

  // Debug: Log session status
  console.log('MainLayout - Session status:', status, 'Session:', session);
  console.log('MainLayout - Component re-rendered at:', new Date().toISOString());

  const handleSignOut = async () => {
    await signOut({ callbackUrl: `/${locale}/auth/login` });
  };

      return (
        <div className="min-h-screen bg-background">
          <Sidebar user={session?.user} onSignOut={handleSignOut} />
          <div className={isRTL ? 'lg:mr-64' : 'lg:ml-64'}>
            <main className="py-6 sm:py-8 lg:py-10">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                {children}
              </div>
            </main>
          </div>
        </div>
      );
}
