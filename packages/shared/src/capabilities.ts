export const ROLES = ['OWNER', 'MANAGER', 'STAFF', 'RIDER'] as const;
export type Role = (typeof ROLES)[number];

export const CAPABILITIES = [
  'orders.take', // create, edit before prep, advance, hold/resume
  'orders.cancel', // cancelling a paid order is a refund and needs approval
  'payments.record',
  'refunds.request',
  'discounts.apply', // above the owner's threshold, needs approval
  'shift.operate', // open/close own drawer, drops, payout requests
  'shift.own_cash.view', // cash figures for the user's own shift only
  'stock.count', // prep counts, raw counts, sold-out toggle
  'deliveries.update',
  'approvals.grant',
  'catalog.manage',
  'staff.manage',
  'expenses.manage',
  'devices.manage',
  'settings.manage',
  'reports.revenue.view', // any aggregate money figure: sales totals, profit, margins
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const STAFF_CAPABILITIES: readonly Capability[] = [
  'orders.take',
  'orders.cancel',
  'payments.record',
  'refunds.request',
  'discounts.apply',
  'shift.operate',
  'shift.own_cash.view',
  'stock.count',
];

const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  OWNER: CAPABILITIES,
  MANAGER: [
    ...STAFF_CAPABILITIES,
    'approvals.grant',
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
