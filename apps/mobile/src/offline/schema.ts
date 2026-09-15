import { Database, type SqlDriver } from './sql';

/**
 * The tablet's own SQLite database.
 *
 * Synced tables mirror what GET /sync/pull sends, keeping only the columns the counter needs
 * (never cost prices or sales totals). Local tables hold the outbox of changes waiting to upload
 * and the bookkeeping that lets a change the server refuses be undone (see store.ts).
 */

export interface SyncedTable {
  /** The local table. */
  readonly name: string;
  /** Where its rows arrive in a pull response. */
  readonly pullKey: string;
  /** The server's field names; each is kept in the snake_case column of the same name. */
  readonly fields: readonly string[];
  /** For a table with one row and no id of its own (the business's settings). */
  readonly singletonId?: string;
}

export const SYNCED_TABLES = [
  {
    name: 'settings',
    pullKey: 'tenantSettings',
    singletonId: 'tenant',
    fields: ['requirePaymentBeforePrep', 'idleLockSeconds', 'countPortions', 'offersDineIn'],
  },
  {
    name: 'staff',
    pullKey: 'staff',
    fields: ['id', 'displayName', 'role', 'active', 'pinVerifier'],
  },
  { name: 'categories', pullKey: 'categories', fields: ['id', 'name', 'position', 'active'] },
  {
    name: 'items',
    pullKey: 'items',
    fields: [
      'id',
      'categoryId',
      'name',
      'description',
      'price',
      'prepMinutes',
      'station',
      'soldOutOn',
      'position',
      'active',
    ],
  },
  {
    name: 'item_variants',
    pullKey: 'itemVariants',
    fields: ['id', 'itemId', 'name', 'price', 'position', 'active'],
  },
  {
    name: 'modifier_groups',
    pullKey: 'modifierGroups',
    fields: ['id', 'name', 'minSelect', 'maxSelect', 'position'],
  },
  {
    name: 'modifiers',
    pullKey: 'modifiers',
    fields: ['id', 'groupId', 'name', 'priceDelta', 'position', 'active'],
  },
  {
    name: 'item_modifier_groups',
    pullKey: 'itemModifierGroups',
    fields: ['id', 'itemId', 'groupId', 'position'],
  },
  {
    name: 'item_channel_prices',
    pullKey: 'itemChannelPrices',
    fields: ['id', 'itemId', 'variantId', 'source', 'price'],
  },
  {
    name: 'delivery_zones',
    pullKey: 'deliveryZones',
    fields: ['id', 'name', 'fee', 'active', 'position'],
  },
  {
    name: 'customers',
    pullKey: 'customers',
    fields: ['id', 'phone', 'name', 'notes', 'flagged', 'flaggedReason'],
  },
  {
    name: 'stock_items',
    pullKey: 'stockItems',
    fields: ['id', 'kind', 'itemId', 'name', 'unit', 'lowThreshold', 'onHand', 'onHandDate'],
  },
  {
    name: 'orders',
    pullKey: 'orders',
    fields: [
      'id',
      'deviceId',
      'displayNumber',
      'businessDate',
      'source',
      'arrivalMethod',
      'externalReference',
      'type',
      'status',
      'onHold',
      'payOnCollection',
      'customerId',
      'deliveryAddress',
      'deliveryZoneId',
      'deliveryFee',
      'deliveryFeeCollectedBy',
      'note',
      'discountBps',
      'discountAmountInput',
      'subtotal',
      'discount',
      'total',
      'amountPaid',
      'reviewReasons',
      'cancelReason',
      'createdBy',
      'createdAtDevice',
    ],
  },
  {
    name: 'order_items',
    pullKey: 'orderItems',
    fields: [
      'id',
      'orderId',
      'itemId',
      'variantId',
      'name',
      'variantName',
      'unitPrice',
      'modifiers',
      'quantity',
      'unitTotal',
      'lineTotal',
      'station',
      'note',
      'position',
    ],
  },
  {
    name: 'payments',
    pullKey: 'payments',
    fields: [
      'id',
      'orderId',
      'method',
      'status',
      'amount',
      'tendered',
      'collectedBy',
      'shiftId',
      'createdAtDevice',
    ],
  },
  {
    name: 'refunds',
    pullKey: 'refunds',
    fields: ['id', 'orderId', 'method', 'amount', 'reason', 'createdAtDevice'],
  },
  {
    name: 'payment_links',
    pullKey: 'paymentLinks',
    fields: [
      'id',
      'orderId',
      'deviceId',
      'status',
      'amount',
      'phone',
      'url',
      'failure',
      'sentAt',
      'expiresAt',
      'paidAt',
      'createdAtDevice',
    ],
  },
  {
    name: 'shifts',
    pullKey: 'shifts',
    fields: [
      'id',
      'deviceId',
      'status',
      'openedBy',
      'openedAt',
      'floatAmount',
      'closedBy',
      'closedAt',
      'expectedCash',
      'countedCash',
      'variance',
    ],
  },
  {
    name: 'cash_movements',
    pullKey: 'cashMovements',
    fields: ['id', 'shiftId', 'type', 'amount', 'note', 'staffId', 'createdAtDevice'],
  },
] as const satisfies readonly SyncedTable[];

export type SyncedTableName = (typeof SYNCED_TABLES)[number]['name'];

export const columnOf = (field: string) => field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** The local columns of a synced table, id first. */
export function columnsOf(table: SyncedTable): string[] {
  const columns = table.fields.map(columnOf);
  return table.singletonId ? ['id', ...columns] : columns;
}

/**
 * Frozen once released: each entry upgrades the database by one version. To change the schema,
 * add an entry; never edit one that has shipped. Mirrored columns are all nullable, so an
 * unexpected null from the server can never block a pull.
 */
export const MIGRATIONS: readonly (readonly string[])[] = [
  [
    `CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)`,
    `CREATE TABLE outbox (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      staff_id TEXT NOT NULL,
      device_ts TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      result TEXT,
      error_code TEXT,
      error_message TEXT,
      resolved_at TEXT
    )`,
    `CREATE INDEX outbox_status ON outbox (status, seq)`,
    `CREATE TABLE row_locks (
      tbl TEXT NOT NULL,
      row_id TEXT NOT NULL,
      command_id TEXT NOT NULL,
      PRIMARY KEY (tbl, row_id, command_id)
    )`,
    `CREATE INDEX row_locks_command ON row_locks (command_id)`,
    `CREATE TABLE shadows (tbl TEXT NOT NULL, row_id TEXT NOT NULL, data TEXT, PRIMARY KEY (tbl, row_id))`,

    `CREATE TABLE settings (id TEXT PRIMARY KEY, require_payment_before_prep INTEGER, idle_lock_seconds INTEGER)`,
    `CREATE TABLE staff (id TEXT PRIMARY KEY, display_name TEXT, role TEXT, active INTEGER, pin_verifier TEXT)`,
    `CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT, position INTEGER, active INTEGER)`,
    `CREATE TABLE items (
      id TEXT PRIMARY KEY, category_id TEXT, name TEXT, description TEXT, price INTEGER,
      prep_minutes INTEGER, station TEXT, sold_out_on TEXT, position INTEGER, active INTEGER
    )`,
    `CREATE INDEX items_category ON items (category_id)`,
    `CREATE TABLE item_variants (
      id TEXT PRIMARY KEY, item_id TEXT, name TEXT, price INTEGER, position INTEGER, active INTEGER
    )`,
    `CREATE INDEX item_variants_item ON item_variants (item_id)`,
    `CREATE TABLE modifier_groups (
      id TEXT PRIMARY KEY, name TEXT, min_select INTEGER, max_select INTEGER, position INTEGER
    )`,
    `CREATE TABLE modifiers (
      id TEXT PRIMARY KEY, group_id TEXT, name TEXT, price_delta INTEGER, position INTEGER, active INTEGER
    )`,
    `CREATE INDEX modifiers_group ON modifiers (group_id)`,
    `CREATE TABLE item_modifier_groups (id TEXT PRIMARY KEY, item_id TEXT, group_id TEXT, position INTEGER)`,
    `CREATE INDEX item_modifier_groups_item ON item_modifier_groups (item_id)`,
    `CREATE TABLE delivery_zones (id TEXT PRIMARY KEY, name TEXT, fee INTEGER, active INTEGER, position INTEGER)`,
    `CREATE TABLE customers (
      id TEXT PRIMARY KEY, phone TEXT, name TEXT, notes TEXT, flagged INTEGER, flagged_reason TEXT
    )`,
    `CREATE INDEX customers_phone ON customers (phone)`,
    `CREATE TABLE stock_items (
      id TEXT PRIMARY KEY, kind TEXT, item_id TEXT, name TEXT, unit TEXT, low_threshold INTEGER,
      on_hand INTEGER, on_hand_date TEXT
    )`,
    `CREATE INDEX stock_items_item ON stock_items (item_id)`,
    `CREATE TABLE orders (
      id TEXT PRIMARY KEY, device_id TEXT, display_number TEXT, business_date TEXT, source TEXT,
      arrival_method TEXT, external_reference TEXT, type TEXT, status TEXT, on_hold INTEGER,
      customer_id TEXT, delivery_address TEXT, delivery_zone_id TEXT, delivery_fee INTEGER,
      delivery_fee_collected_by TEXT, note TEXT, discount_bps INTEGER, discount_amount_input INTEGER,
      subtotal INTEGER, discount INTEGER, total INTEGER, amount_paid INTEGER, review_reasons TEXT,
      cancel_reason TEXT, created_by TEXT, created_at_device TEXT
    )`,
    `CREATE INDEX orders_status ON orders (status)`,
    `CREATE INDEX orders_business_date ON orders (business_date)`,
    `CREATE TABLE order_items (
      id TEXT PRIMARY KEY, order_id TEXT, item_id TEXT, variant_id TEXT, name TEXT, variant_name TEXT,
      unit_price INTEGER, modifiers TEXT, quantity INTEGER, unit_total INTEGER, line_total INTEGER,
      station TEXT, note TEXT, position INTEGER
    )`,
    `CREATE INDEX order_items_order ON order_items (order_id)`,
    `CREATE TABLE payments (
      id TEXT PRIMARY KEY, order_id TEXT, method TEXT, status TEXT, amount INTEGER, tendered INTEGER,
      collected_by TEXT, shift_id TEXT, created_at_device TEXT
    )`,
    `CREATE INDEX payments_order ON payments (order_id)`,
    `CREATE INDEX payments_shift ON payments (shift_id)`,
    `CREATE TABLE refunds (
      id TEXT PRIMARY KEY, order_id TEXT, method TEXT, amount INTEGER, reason TEXT, created_at_device TEXT
    )`,
    `CREATE INDEX refunds_order ON refunds (order_id)`,
    `CREATE TABLE shifts (
      id TEXT PRIMARY KEY, device_id TEXT, status TEXT, opened_by TEXT, opened_at TEXT,
      float_amount INTEGER, closed_by TEXT, closed_at TEXT, expected_cash INTEGER,
      counted_cash INTEGER, variance INTEGER
    )`,
    `CREATE TABLE cash_movements (
      id TEXT PRIMARY KEY, shift_id TEXT, type TEXT, amount INTEGER, note TEXT, staff_id TEXT,
      created_at_device TEXT
    )`,
    `CREATE INDEX cash_movements_shift ON cash_movements (shift_id)`,
  ],
  [
    // Wrong PINs per person, for the offline lockout (src/tablet/pin-guard.ts). Tied to the
    // verifier, so a new PIN from a manager starts the count again.
    `CREATE TABLE pin_attempts (
      staff_id TEXT PRIMARY KEY,
      verifier TEXT NOT NULL,
      failures INTEGER NOT NULL,
      locked_until TEXT
    )`,
  ],
  [
    // The owner's switch for morning portion counts (plan.md §2.4). Null until the server sends
    // it, which reads as off.
    `ALTER TABLE settings ADD COLUMN count_portions INTEGER`,
  ],
  [
    // Payment links texted to customers (plan.md §2.5): the counter shows sent, paid, or why not.
    `CREATE TABLE payment_links (
      id TEXT PRIMARY KEY, order_id TEXT, status TEXT, amount INTEGER, phone TEXT, url TEXT,
      failure TEXT, sent_at TEXT, expires_at TEXT, paid_at TEXT, created_at_device TEXT
    )`,
    `CREATE INDEX payment_links_order ON payment_links (order_id)`,
  ],
  [
    // Bolt Food and Chowdeck prices set on the dashboard (plan.md §3.1), so a platform order
    // carries the platform's price. Forgetting the cursor makes the next pull a full snapshot,
    // which brings in the prices set before this update.
    `CREATE TABLE item_channel_prices (
      id TEXT PRIMARY KEY, item_id TEXT, variant_id TEXT, source TEXT, price INTEGER
    )`,
    `CREATE INDEX item_channel_prices_item ON item_channel_prices (item_id)`,
    `DELETE FROM meta WHERE key = 'cursor'`,
  ],
  [
    // Dine-in, pickup or delivery (13 Sep): the owner's dine-in switch, and walk-ins become
    // pickups as they did on the server, queued ones too. Forgetting the cursor makes the next
    // pull a full snapshot, which brings in the switch.
    `ALTER TABLE settings ADD COLUMN offers_dine_in INTEGER`,
    `UPDATE orders SET type = 'PICKUP' WHERE type = 'WALK_IN'`,
    `UPDATE outbox SET payload = replace(payload, '"type":"WALK_IN"', '"type":"PICKUP"')
      WHERE type = 'order.create'`,
    `DELETE FROM meta WHERE key = 'cursor'`,
  ],
  [
    // Online orders (plan.md §4.0): one paid in cash when it's collected is cooked before it's
    // paid. Forgetting the cursor brings the flag in for online orders already on the tablet.
    `ALTER TABLE orders ADD COLUMN pay_on_collection INTEGER`,
    `DELETE FROM meta WHERE key = 'cursor'`,
  ],
  [
    // Which tablet asked for each payment link (15 Sep), so the counter's notes follow the links
    // it sent, on any order. Forgetting the cursor brings it in for links already on the tablet.
    `ALTER TABLE payment_links ADD COLUMN device_id TEXT`,
    `DELETE FROM meta WHERE key = 'cursor'`,
  ],
];

/** Brings the database up to the latest version, one migration per transaction. */
export async function migrate(db: Database): Promise<void> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  for (let version = row?.user_version ?? 0; version < MIGRATIONS.length; version++) {
    await db.transaction(async (tx) => {
      for (const statement of MIGRATIONS[version]!) await tx.run(statement);
      await tx.run(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

/** Empties every table, for a fresh registration: nothing from another business or tablet stays. */
export async function resetLocalData(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    const tables = await tx.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    );
    for (const { name } of tables) await tx.run(`DELETE FROM ${name}`);
  });
}

export async function openLocalDatabase(driver: SqlDriver): Promise<Database> {
  const db = new Database(driver);
  await db.run('PRAGMA journal_mode = WAL');
  await migrate(db);
  return db;
}
