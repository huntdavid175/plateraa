/**
 * Food businesses already using Plateraa that have agreed to be named on the site. The strip under
 * the home page's hero shows nothing while this is empty (user, 15 Oct: real businesses only; names
 * and logos to come from the user). `logo` is a path under public/, e.g. '/vendors/amas-kitchen.png';
 * without one, the name shows in type.
 */
export interface Vendor {
  name: string;
  area?: string;
  logo?: string;
}

export const VENDORS: Vendor[] = [];
