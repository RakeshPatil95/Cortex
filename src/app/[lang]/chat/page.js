'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import ChatContent from '@/components/chat/ChatContent';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useTranslations } from '@/lib/translations';

export default function ChatPage() {
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

  const handleSignOut = async () => {
    await signOut({ callbackUrl: `/${locale}/auth/login` });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Sidebar user={session?.user} onSignOut={handleSignOut} />
      <div className={`${isRTL ? 'lg:mr-64' : 'lg:ml-64'}`}>
        <ChatContent />
      </div>
    </div>
  );
}
