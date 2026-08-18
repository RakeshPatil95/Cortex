import LocaleLayout from '@/components/layout/LocaleLayout';

export async function generateStaticParams() {
  return [{ lang: 'ar' }, { lang: 'en' }];
}

export default async function LangLayout({ children, params }) {
  const { lang } = await params;
  
  return (
    <LocaleLayout>
      {children}
    </LocaleLayout>
  );
}
