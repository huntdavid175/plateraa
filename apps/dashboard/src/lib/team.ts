import { api, call } from './api';
import { queryClient } from './query';

export const fetchTeam = () => call(api.GET('/api/staff'));
export type Team = Awaited<ReturnType<typeof fetchTeam>>;
export type TeamMember = Team['staff'][number];
export type RevenueByRole = Team['revenueByRole'];

export const addStaff = (body: {
  displayName: string;
  role: 'MANAGER' | 'STAFF' | 'RIDER';
  pin: string;
}) => call(api.POST('/api/staff', { body }));

export const updateStaff = (
  id: string,
  body: {
    displayName?: string;
    role?: 'MANAGER' | 'STAFF' | 'RIDER';
    active?: boolean;
    seesRevenue?: boolean | null;
  },
) => call(api.PUT('/api/staff/{id}', { params: { path: { id } }, body }));

export const resetPin = (id: string, pin: string) =>
  call(api.PUT('/api/staff/{id}/pin', { params: { path: { id } }, body: { pin } }));

export const setRevenueVisibility = (byRole: RevenueByRole) =>
  call(api.PUT('/api/staff/revenue-visibility', { body: { byRole } }));

export const fetchTablets = () => call(api.GET('/api/devices'));
export type Tablet = Awaited<ReturnType<typeof fetchTablets>>[number];

export const signOutTablet = (id: string) =>
  call(api.POST('/api/devices/{id}/sign-out', { params: { path: { id } } }));

/** After a change on the Staff page, the team and the tablets load again. */
export function refreshTeam() {
  void queryClient.invalidateQueries({ queryKey: ['team'] });
  void queryClient.invalidateQueries({ queryKey: ['tablets'] });
  // Permissions may have changed for the person signed in.
  void queryClient.invalidateQueries({ queryKey: ['me'] });
}
