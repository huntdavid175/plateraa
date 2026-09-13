import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Themed } from '../../../../components/ui';
import { fetchOrder } from '../../../../lib/api';
import { OrderStatus } from './order-status';

type Props = { params: Promise<{ slug: string; token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const order = await fetchOrder((await params).token);
  return { title: order ? `Order ${order.number} · ${order.storeName}` : 'Order not found' };
}

/** The customer's page for one order, from the same link any time: where it stands, and paying. */
export default async function OrderPage({ params }: Props) {
  const { token } = await params;
  const order = await fetchOrder(token);
  if (!order) notFound();
  return (
    <Themed theme={order.theme}>
      <OrderStatus token={token} initial={order} />
    </Themed>
  );
}
