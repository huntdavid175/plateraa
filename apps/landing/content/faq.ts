import type { Question } from '../components/faq';

/** Questions that come up before signing up. Each answer must stay true to what Plateraa does today. */
export const HOME_FAQ: Question[] = [
  {
    q: 'What is Plateraa?',
    a: 'Plateraa runs the business side of a food spot. Your staff take orders on an Android tablet at the counter, customers can order and pay from your own online store, and you see sales, expenses and profit on your phone or laptop.',
  },
  {
    q: 'How much does Plateraa cost?',
    a: 'It’s free to start and there’s no monthly fee. When a customer pays you online through Plateraa, by payment link or through your online store, Plateraa’s share is 2% of that payment. Cash sales are free. Moolre charges its own fee on mobile money payments.',
  },
  {
    q: 'What do I need to get started?',
    a: 'An Android tablet for the counter (8 to 10 inches works best), an internet connection some of the time, and your own Moolre merchant account if you want to take mobile money. You set everything else up from your phone.',
  },
  {
    q: 'What happens when the internet goes off?',
    a: 'The tablet keeps taking orders, cash and stock changes. They’re saved on the tablet and sent up once it’s back online, so you can keep serving through the outage.',
  },
  {
    q: 'Does Plateraa hold my money?',
    a: 'No. Mobile money from your customers goes straight into your own Moolre merchant account. Plateraa records the payment so your figures add up, but the money never passes through us.',
  },
  {
    q: 'Can my staff see how much I make?',
    a: 'Only if you let them. Staff take orders and handle the drawer with their own PIN. Totals, reports and profit are for owners, and for managers you choose.',
  },
];

export const PRICING_FAQ: Question[] = [
  {
    q: 'Is there really no monthly fee?',
    a: 'That’s right. Signing up, the tablet app, your online store, the dashboard and adding your staff cost nothing. Plateraa earns only when a customer pays you online.',
  },
  {
    q: 'What counts as an online payment?',
    a: 'Money a customer pays through Plateraa: a payment link texted from your tablet, or checkout on your online store. Cash at the counter, and cash on pickup for online orders, are free.',
  },
  {
    q: 'Does Moolre charge a fee as well?',
    a: 'Yes. Moolre charges its own fee on each mobile money payment it processes. That fee is Moolre’s and is separate from Plateraa’s 2%.',
  },
  {
    q: 'Do I need a Moolre account?',
    a: 'Yes, to take mobile money. It’s your own merchant account, opened with Moolre, so payments land with you. You connect it while setting up Plateraa, and we check that it works.',
  },
  {
    q: 'Do I have to buy equipment?',
    a: 'Plateraa runs on an ordinary Android tablet, 8 to 10 inches. If you already have one, there’s nothing else to buy.',
  },
];
