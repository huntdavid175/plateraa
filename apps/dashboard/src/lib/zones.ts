import { api, call } from './api';
import { queryClient } from './query';

/** Delivery zones and their fees, in the order the tablet shows them. Needs `catalog.manage`. */
export const fetchZones = () => call(api.GET('/api/delivery-zones'));
export type Zone = Awaited<ReturnType<typeof fetchZones>>[number];

/** Adds the zone, or changes it. The id is made here, so saving twice saves it once. */
export const saveZone = (zoneId: string, body: { name: string; fee: number; active: boolean }) =>
  call(api.PUT('/api/delivery-zones/{zoneId}', { params: { path: { zoneId } }, body }));

export const removeZone = (zoneId: string) =>
  call(api.DELETE('/api/delivery-zones/{zoneId}', { params: { path: { zoneId } } }));

export function refreshZones() {
  void queryClient.invalidateQueries({ queryKey: ['zones'] });
}
