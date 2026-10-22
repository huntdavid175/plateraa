import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Themed } from '../../../components/ui';
import { fetchStore } from '../../../lib/api';
import { CHAT_ON } from '../../../lib/chat';
import { Chat } from './chat';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!CHAT_ON) return { title: 'Page not found' };
  const store = await fetchStore((await params).slug);
  return { title: store ? `${store.name} · Order by chat` : 'Store not found' };
}

/** Ordering by chat (a test page): the same store, the same order, asked for in words. */
export default async function ChatPage({ params }: Props) {
  if (!CHAT_ON) notFound();
  const store = await fetchStore((await params).slug);
  if (!store) notFound();
  return (
    <Themed theme={store.theme}>
      <Chat store={store} />
    </Themed>
  );
}
