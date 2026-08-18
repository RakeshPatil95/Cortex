import { redirect } from 'next/navigation';

export default async function HomePage({ params }) {
  const { lang } = await params;
  redirect(`/${lang}/auth/login`);
}
