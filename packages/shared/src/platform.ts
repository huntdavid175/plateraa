/**
 * Brixx's own team, on the admin console (apps/admin). Separate from vendors' roles: a login gets
 * one of these from `platform_staff`, whatever businesses it may also belong to.
 */
export const PLATFORM_ROLES = ['ADMIN', 'SUPPORT'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_CAPABILITIES = [
  'platform.view', // every business, order, tablet, figure and the audit log
  'requests.decide', // approve or decline a request to join
  'support.fix', // reset a staff PIN, sign a tablet out
  'notes.write', // notes on a business, for the team
  'businesses.suspend', // suspend or restore a business
  'audit.export', // download the audit log
  'team.manage', // add Brixx team members and change their roles
] as const;
export type PlatformCapability = (typeof PLATFORM_CAPABILITIES)[number];

/** Customer service can let businesses in and fix what vendors call about, nothing more. */
const SUPPORT: readonly PlatformCapability[] = [
  'platform.view',
  'requests.decide',
  'support.fix',
  'notes.write',
];

export const PLATFORM_ROLE_CAPABILITIES: Record<PlatformRole, readonly PlatformCapability[]> = {
  ADMIN: PLATFORM_CAPABILITIES,
  SUPPORT,
};

export function platformCan(role: PlatformRole, capability: PlatformCapability): boolean {
  return PLATFORM_ROLE_CAPABILITIES[role].includes(capability);
}
