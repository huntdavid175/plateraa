import { formatCedis, type Pesewas } from '@brixx/shared';

/** Money as the store shows it: "GH₵ 35.00". Amounts are whole pesewas, as the API sends them. */
export const ghs = (amount: number) => formatCedis(amount as Pesewas).replace('GH₵', 'GH₵ ');
