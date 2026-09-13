import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Themed } from '../../components/ui';
import { fetchStore } from '../../lib/api';
import { Storefront } from './storefront';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const store = await fetchStore((await params).slug);
  return store
    ? { title: `${store.name} · Order online`, description: store.area ?? undefined }
    : { title: 'Store not found' };
}

/** A store's page, read fresh on every visit, so prices and sold-out items are always today's. */
export default async function StorePage({ params }: Props) {
  const store = await fetchStore((await params).slug);
  if (!store) notFound();
  return (
    <Themed theme={store.theme}>
      <Storefront store={store} />
    </Themed>
  );
}
