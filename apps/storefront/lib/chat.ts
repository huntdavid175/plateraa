import { normalizeGhanaPhone } from '@brixx/shared';
import { ulid } from 'ulid';
import { api, messageOf, OFFLINE, type Store } from './api';
import { priceCart, type CartLine } from './cart';
import { ghs } from './money';

/**
 * Ordering by chat (a test, 21 Oct): OpenAI reads the menu and the order so far, and has two
 * tools — `set_order`, checked against today's menu here, and `place_order`, which goes to the
 * same public API the checkout uses. Only the storefront's server talks to OpenAI, so the key
 * (`OPENAI_API_KEY`) never reaches the browser.
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Placed {
  token: string;
  number: string;
  payUrl: string | null;
  payProblem: string | null;
}

export type ChatResult =
  | { ok: true; reply: string; cart: CartLine[]; placed: Placed | null }
  | { ok: false; message: string };

const MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';

/** The chat is off (22 Oct, user decision) unless `STOREFRONT_CHAT=on`: its page is not found. */
export const CHAT_ON = process.env.STOREFRONT_CHAT === 'on';

/** The menu in words, with the ids the model needs to fill the order. */
function menuWords(store: Store): string {
  const rows: string[] = [];
  const groups = [...store.categories, { id: null, name: 'Other' }];
  for (const category of groups) {
    const items = store.items.filter((item) => item.categoryId === category.id);
    if (!items.length) continue;
    rows.push(`## ${category.name}`);
    for (const item of items) {
      rows.push(
        `- ${item.name} [${item.id}] ${ghs(item.price)}${item.soldOut ? ' (SOLD OUT)' : ''}` +
          (item.description ? ` — ${item.description}` : ''),
      );
      if (item.variants.length) {
        rows.push(
          `  sizes (pick one): ${item.variants.map((v) => `${v.name} [${v.id}] ${ghs(v.price)}`).join('; ')}`,
        );
      }
      for (const group of item.groups) {
        const most = group.maxSelect === null ? 'any' : String(group.maxSelect);
        rows.push(
          `  ${group.name} (choose ${group.minSelect}–${most}): ` +
            group.options.map((o) => `${o.name} [${o.id}] +${ghs(o.priceDelta)}`).join('; '),
        );
      }
    }
  }
  return rows.join('\n');
}

function orderWords(store: Store, cart: CartLine[]): string {
  if (!cart.length) return 'Empty.';
  const priced = priceCart(store, cart);
  const lines = priced.map(
    (line) =>
      `- ${line.quantity} × ${line.name}${line.variantName ? ` (${line.variantName})` : ''}` +
      (line.extras.length ? ` with ${line.extras.join(', ')}` : '') +
      ` = ${ghs(line.lineTotal)}${line.problem ? ` [${line.problem}]` : ''}`,
  );
  const total = priced.reduce((sum, line) => sum + line.lineTotal, 0);
  return `${lines.join('\n')}\nItems total: ${ghs(total)} (delivery fee extra)`;
}

function systemPrompt(store: Store, cart: CartLine[]): string {
  const pay = [
    store.payOnline && 'ONLINE (mobile money or card through a payment link)',
    store.cashOnPickup && 'CASH (only for pickup)',
  ].filter(Boolean);
  return `You take food orders by chat for ${store.name}${store.area ? `, ${store.area}` : ''}, in Ghana.
Be warm, short and plain-spoken; customers are on their phones. Prices are in Ghana cedis (GH₵).

Rules:
- Only sell what is on the menu below. Never invent items, sizes, extras or prices.
- Whenever the order changes, call set_order with the WHOLE order as it should now be.
- Ask for a size when an item has sizes, and for required choices (choose at least 1).
- When an item has optional extras (choose 0–…), offer them once in a short question before moving on, e.g. "Any protein with your fried rice? Chicken +GH₵15, Egg +GH₵5…".
- Each extra can be added only once per plate. If someone wants two of an extra (e.g. 2 eggs), say only one of each fits on a plate, and offer a second plate instead.
- After any tool call, your reply must stand on its own: say what changed in the order and ask the next question. Don't add side notes or reminders.
- Only mention opening hours if the customer asks or the store is closed.
- Before placing the order you need: pickup or delivery${store.zones.length ? ` (delivery zones: ${store.zones.map((z) => `${z.name} [${z.id}] fee ${ghs(z.fee)}`).join('; ')})` : ' (this store is pickup only)'}, the delivery address if delivering, the customer's name and Ghana phone number, and how they will pay: ${pay.join(' or ') || 'no way to pay is set up, so orders cannot be placed'}.
- Read the order back with its total and get a clear yes before calling place_order. Call it once.
- ${store.open ? 'The store is open.' : `The store is CLOSED${store.opensWords ? ` (${store.opensWords})` : ''}: help them look at the menu, but do not place orders.`}
- Hours (only if asked): ${store.hours}.

Menu (ids in brackets are for the tools only; never show them to the customer):
${menuWords(store)}

The order so far:
${orderWords(store, cart)}`;
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'set_order',
      description: 'Replace the order with these lines. Send every line, not just the change.',
      parameters: {
        type: 'object',
        properties: {
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                itemId: { type: 'string' },
                variantId: { type: ['string', 'null'], description: 'The size id, if any' },
                optionIds: { type: 'array', items: { type: 'string' } },
                quantity: { type: 'integer', minimum: 1, maximum: 50 },
              },
              required: ['itemId', 'variantId', 'optionIds', 'quantity'],
              additionalProperties: false,
            },
          },
        },
        required: ['lines'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'place_order',
      description: 'Place the current order, once the customer has said yes to it.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['PICKUP', 'DELIVERY'] },
          name: { type: 'string' },
          phone: { type: 'string' },
          payment: { type: 'string', enum: ['ONLINE', 'CASH'] },
          zoneId: { type: ['string', 'null'] },
          address: { type: ['string', 'null'] },
          note: { type: ['string', 'null'], description: 'Anything for the kitchen' },
        },
        required: ['type', 'name', 'phone', 'payment', 'zoneId', 'address', 'note'],
        additionalProperties: false,
      },
    },
  },
] as const;

type ToolCall = { id: string; function: { name: string; arguments: string } };
type OpenAIMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

/** Checks proposed lines against today's menu; the problems are told back to the model. */
function checkLines(store: Store, lines: CartLine[]): string[] {
  const problems: string[] = [];
  for (const line of lines) {
    const item = store.items.find((row) => row.id === line.itemId);
    if (!item) {
      problems.push(`${line.itemId} is not on the menu.`);
      continue;
    }
    if (item.soldOut) problems.push(`${item.name} is sold out.`);
    if (item.variants.length && !item.variants.some((v) => v.id === line.variantId)) {
      problems.push(`${item.name} needs a size: ${item.variants.map((v) => v.name).join(', ')}.`);
    }
    if (!item.variants.length && line.variantId) problems.push(`${item.name} has no sizes.`);
    const known = new Set(item.groups.flatMap((group) => group.options.map((o) => o.id)));
    if (new Set(line.optionIds).size !== line.optionIds.length) {
      problems.push(`Each extra fits only once on a plate of ${item.name}.`);
    }
    if (line.optionIds.some((id) => !known.has(id))) {
      problems.push(`Some extras chosen aren't offered with ${item.name}.`);
    }
    for (const group of item.groups) {
      const picked = group.options.filter((o) => line.optionIds.includes(o.id)).length;
      if (picked < group.minSelect) {
        problems.push(`${item.name} needs ${group.minSelect} from ${group.name}.`);
      }
      if (group.maxSelect !== null && picked > group.maxSelect) {
        problems.push(`${item.name} allows at most ${group.maxSelect} from ${group.name}.`);
      }
    }
  }
  return problems;
}

interface PlaceArgs {
  type: 'PICKUP' | 'DELIVERY';
  name: string;
  phone: string;
  payment: 'ONLINE' | 'CASH';
  zoneId: string | null;
  address: string | null;
  note: string | null;
}

async function place(
  store: Store,
  cart: CartLine[],
  orderId: string,
  args: PlaceArgs,
): Promise<{ placed: Placed } | { problem: string }> {
  if (!cart.length) return { problem: 'The order is empty.' };
  const problems = checkLines(store, cart);
  if (problems.length) return { problem: problems.join(' ') };
  const digits = args.phone.replace(/\D/g, '');
  const phone = digits.length === 9 ? `0${digits}` : args.phone.trim();
  if (!normalizeGhanaPhone(phone)) return { problem: 'That phone number is not a Ghana number.' };
  if (args.type === 'DELIVERY' && (!args.zoneId || !args.address?.trim())) {
    return { problem: 'Delivery needs a zone and an address.' };
  }
  try {
    const { data, error, response } = await api.POST('/api/public/stores/{slug}/orders', {
      params: { path: { slug: store.slug } },
      body: {
        orderId,
        type: args.type,
        lines: cart.map((line) => ({
          itemId: line.itemId,
          ...(line.variantId ? { variantId: line.variantId } : {}),
          optionIds: line.optionIds,
          quantity: line.quantity,
        })),
        customer: { name: args.name.trim(), phone },
        ...(args.type === 'DELIVERY' && args.zoneId && args.address
          ? { delivery: { zoneId: args.zoneId, address: args.address.trim() } }
          : {}),
        ...(args.note?.trim() ? { note: args.note.trim() } : {}),
        payment: args.payment,
      },
    });
    if (!data) return { problem: messageOf(error, response.status) };
    return { placed: data };
  } catch {
    return { problem: OFFLINE };
  }
}

async function complete(messages: OpenAIMessage[], key: string) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: TOOLS,
      // The gpt-5 and o-series models think before answering; a little is enough for a menu.
      ...(/^(gpt-5|o\d)/.test(MODEL) ? { reasoning_effort: 'low' } : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const body = (await response.json()) as {
    choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[];
  };
  return body.choices[0]!.message;
}

/** One turn of the chat: the model may change the order or place it before it answers. */
export async function chatTurn(
  store: Store,
  history: ChatMessage[],
  startCart: CartLine[],
  orderId: string,
): Promise<ChatResult> {
  if (!CHAT_ON) return { ok: false, message: 'Ordering by chat is switched off.' };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, message: 'OPENAI_API_KEY is not set for the storefront.' };

  let cart = startCart;
  let placed: Placed | null = null;
  const turn: OpenAIMessage[] = [];
  const said: string[] = [];

  try {
    for (let step = 0; step < 6; step++) {
      const message = await complete(
        [{ role: 'system', content: systemPrompt(store, cart) }, ...history.slice(-30), ...turn],
        key,
      );
      if (message.content?.trim()) said.push(message.content.trim());
      if (!message.tool_calls?.length) {
        // What it said alongside a tool call counts too: the last words alone can be an aside.
        return { ok: true, reply: said.join('\n\n'), cart, placed };
      }
      turn.push({ role: 'assistant', content: message.content, tool_calls: message.tool_calls });
      for (const call of message.tool_calls) {
        let answer: string;
        try {
          const args: unknown = JSON.parse(call.function.arguments);
          if (call.function.name === 'set_order') {
            const proposed = (args as { lines: (CartLine & { variantId: string | null })[] }).lines
              .filter((line) => line.quantity > 0)
              .map((line) => ({
                uid: ulid(),
                itemId: line.itemId,
                ...(line.variantId ? { variantId: line.variantId } : {}),
                optionIds: line.optionIds ?? [],
                quantity: line.quantity,
              }));
            const problems = checkLines(store, proposed);
            if (problems.length) {
              answer = `Not changed: ${problems.join(' ')}`;
            } else {
              cart = proposed;
              answer = `Order is now:\n${orderWords(store, cart)}`;
            }
          } else if (call.function.name === 'place_order') {
            if (placed) {
              answer = `Already placed as order ${placed.number}.`;
            } else if (!store.open) {
              answer = 'The store is closed; the order was not placed.';
            } else {
              const result = await place(store, cart, orderId, args as PlaceArgs);
              if ('placed' in result) {
                placed = result.placed;
                answer =
                  `Placed as order ${placed.number}.` +
                  (placed.payUrl
                    ? ' A payment link is shown to the customer under this chat.'
                    : '') +
                  (placed.payProblem
                    ? ` The payment page could not open: ${placed.payProblem}`
                    : '');
              } else {
                answer = `Not placed: ${result.problem}`;
              }
            }
          } else {
            answer = 'Unknown tool.';
          }
        } catch {
          answer = 'The tool arguments could not be read.';
        }
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[chat] ${call.function.name} ${call.function.arguments}\n  → ${answer}`);
        }
        turn.push({ role: 'tool', tool_call_id: call.id, content: answer });
      }
    }
    return { ok: true, reply: 'Sorry, I got muddled. Could you say that again?', cart, placed };
  } catch (error) {
    console.error(error);
    return { ok: false, message: 'The assistant is not answering right now. Try again.' };
  }
}
