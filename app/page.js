import { Suspense } from 'react';
import HomePageClient from '@/components/HomePageClient';

function HomePageFallback() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-sm text-slate-500">
      Chargement...
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<HomePageFallback />}>
      <HomePageClient />
    </Suspense>
  );
}
