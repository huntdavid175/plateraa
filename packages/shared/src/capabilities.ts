export const ROLES = ['OWNER', 'MANAGER', 'STAFF', 'RIDER'] as const;
export type Role = (typeof ROLES)[number];

export const CAPABILITIES = [
  'orders.take', // create, edit before prep, advance, hold/resume
  'orders.cancel', // a cancelled paid order leaves a refund owed for a manager to record
  'payments.record',
  'shift.operate', // open/close own drawer, drops, pay-ins
  'shift.own_cash.view', // cash figures for the user's own shift only
  'stock.count', // prep counts, raw counts, sold-out toggle
  'deliveries.update',
  'refunds.record', // dashboard: record money given back by hand
  'payouts.record', // dashboard: record cash paid out of a drawer
  'discounts.apply', // dashboard: discount an unpaid order
  'catalog.manage',
  'staff.manage',
  'expenses.manage',
  'devices.manage',
  'settings.manage',
  'reports.revenue.view', // any aggregate money figure: sales totals, profit, margins
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** What a cashier or cook can do on the tablet. Money never leaves the drawer through them. */
const STAFF_CAPABILITIES: readonly Capability[] = [
  'orders.take',
  'orders.cancel',
  'payments.record',
  'shift.operate',
  'shift.own_cash.view',
  'stock.count',
];

const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  OWNER: CAPABILITIES,
  MANAGER: [
    ...STAFF_CAPABILITIES,
    'refunds.record',
    'payouts.record',
    'discounts.apply',
    'catalog.manage',
    'staff.manage',
    'expenses.manage',
    'devices.manage',
  ],
  STAFF: STAFF_CAPABILITIES,
  RIDER: ['deliveries.update'],
};

/**
 * Revenue visibility is off by default for every role except Owner. The owner can turn it on
 * per role, and override it per person (true/false); null means "use the role setting".
 */
export interface RevenueVisibility {
  byRole: Partial<Record<Exclude<Role, 'OWNER'>, boolean>>;
  override?: boolean | null;
}

export function resolveCapabilities(
  role: Role,
  revenue: RevenueVisibility = { byRole: {} },
): ReadonlySet<Capability> {
  const capabilities = new Set(ROLE_CAPABILITIES[role]);
  if (role !== 'OWNER') {
    const allowed = revenue.override ?? revenue.byRole[role] ?? false;
    if (allowed) capabilities.add('reports.revenue.view');
  }
  return capabilities;
}
