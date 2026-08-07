import HomePageClient from '@/components/HomePageClient';
import {
  getPublicCatalog,
  getPublicLeaderboard,
  getPublicSettings,
} from '@/lib/public-home-data';

export default async function HomePage() {
  const [catalog, settings, leaderboard] = await Promise.all([
    getPublicCatalog(),
    getPublicSettings(),
    getPublicLeaderboard(),
  ]);

  return (
    <HomePageClient
      initialProducts={catalog.products}
      initialPromos={catalog.promos}
      initialCatalogError={catalog.error}
      initialSettings={settings}
      initialLeaderboard={leaderboard}
    />
  );
}
