import { describe, expect, it } from 'vitest';
import { CAPABILITIES, ROLES, resolveCapabilities } from './capabilities.js';

describe('resolveCapabilities', () => {
  it('gives the owner everything, whatever the settings say', () => {
    const owner = resolveCapabilities('OWNER', { byRole: {}, override: false });
    for (const capability of CAPABILITIES) expect(owner.has(capability)).toBe(true);
  });

  it('hides revenue from every other role by default', () => {
    for (const role of ROLES.filter((r) => r !== 'OWNER')) {
      expect(resolveCapabilities(role).has('reports.revenue.view')).toBe(false);
    }
  });

  it('grants revenue per role, and a per-person override wins either way', () => {
    expect(
      resolveCapabilities('MANAGER', { byRole: { MANAGER: true } }).has('reports.revenue.view'),
    ).toBe(true);
    expect(
      resolveCapabilities('MANAGER', { byRole: { MANAGER: true }, override: false }).has(
        'reports.revenue.view',
      ),
    ).toBe(false);
    expect(
      resolveCapabilities('STAFF', { byRole: {}, override: true }).has('reports.revenue.view'),
    ).toBe(true);
  });

  it('lets staff take orders and cash but not approve or manage', () => {
    const staff = resolveCapabilities('STAFF');
    expect(staff.has('orders.take')).toBe(true);
    expect(staff.has('shift.own_cash.view')).toBe(true);
    expect(staff.has('approvals.grant')).toBe(false);
    expect(staff.has('catalog.manage')).toBe(false);
  });

  it('lets managers approve but keeps settings with the owner', () => {
    const manager = resolveCapabilities('MANAGER');
    expect(manager.has('approvals.grant')).toBe(true);
    expect(manager.has('settings.manage')).toBe(false);
  });
});
