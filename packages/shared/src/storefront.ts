/**
 * The looks an owner or manager can give their online store (plan.md §4.0). The owner picks the
 * page's colour; each look pairs it with a stronger band across the top, words tinted to match,
 * and a button colour chosen to go with it: a deeper shade, or a colour that sets it off. Every
 * look has a light and a dark version, and `storefront.test.ts` checks every pair of colours
 * that sits together is easy to read.
 */
export const STOREFRONT_THEMES = [
  'classic',
  'orange',
  'red',
  'pink',
  'purple',
  'blue',
  'teal',
  'green',
  'gold',
] as const;
export type StorefrontTheme = (typeof STOREFRONT_THEMES)[number];

/** What each part of the store's page is painted with. */
export interface StorefrontPalette {
  /** The page behind everything: the colour the owner picks. */
  page: string;
  /** Cards and sheets on the page. */
  card: string;
  /** Quiet fills: photo spaces, choices not picked. */
  tile: string;
  border: string;
  /** Words, and quieter words. */
  ink: string;
  muted: string;
  /** The band across the top of the store, and the words on it. */
  hero: string;
  onHero: string;
  /** Buttons and chosen things, the words on them, and words in the button colour. */
  brand: string;
  onBrand: string;
  brandInk: string;
}

export interface StorefrontLook {
  name: string;
  /** In words, for the picker. */
  describe: string;
  light: StorefrontPalette;
  dark: StorefrontPalette;
}

export const STOREFRONT_LOOKS: Record<StorefrontTheme, StorefrontLook> = {
  classic: {
    name: 'Classic',
    describe: 'Warm grey, with orange buttons',
    light: {
      page: '#F6F5F3',
      card: '#FFFFFF',
      tile: '#ECEAE7',
      border: '#E2DFD9',
      ink: '#1A1917',
      muted: '#67645C',
      hero: '#FBE3CF',
      onHero: '#1A1917',
      brand: '#B8500C',
      onBrand: '#FFFFFF',
      brandInk: '#A8490B',
    },
    dark: {
      page: '#111110',
      card: '#1C1A18',
      tile: '#252320',
      border: '#332F2A',
      ink: '#F0EDE8',
      muted: '#A29E98',
      hero: '#3A2412',
      onHero: '#F6E6D8',
      brand: '#F08A3E',
      onBrand: '#1A0D03',
      brandInk: '#F5A060',
    },
  },
  orange: {
    name: 'Jollof',
    describe: 'Apricot, with forest green buttons',
    light: {
      page: '#FFF1E5',
      card: '#FFFFFF',
      tile: '#FBE3CF',
      border: '#F1D0B4',
      ink: '#2A1709',
      muted: '#7A5840',
      hero: '#F7C39A',
      onHero: '#2A1709',
      brand: '#1D5C4D',
      onBrand: '#FFFFFF',
      brandInk: '#1D5C4D',
    },
    dark: {
      page: '#1A120C',
      card: '#241911',
      tile: '#302117',
      border: '#402D1F',
      ink: '#F8ECE1',
      muted: '#C2A68F',
      hero: '#5A3016',
      onHero: '#FCEBDD',
      brand: '#5CC2A6',
      onBrand: '#0A1F1A',
      brandInk: '#6FD0B4',
    },
  },
  red: {
    name: 'Pepper',
    describe: 'Blush, with deep crimson buttons',
    light: {
      page: '#FFF0EE',
      card: '#FFFFFF',
      tile: '#FADDD9',
      border: '#F0C8C3',
      ink: '#2B0F0D',
      muted: '#7F4B46',
      hero: '#F3B0A8',
      onHero: '#2B0F0D',
      brand: '#9B1C2E',
      onBrand: '#FFFFFF',
      brandInk: '#9B1C2E',
    },
    dark: {
      page: '#1B0E0E',
      card: '#251414',
      tile: '#321B1B',
      border: '#442625',
      ink: '#FBEAE8',
      muted: '#CC9E99',
      hero: '#5E1A1C',
      onHero: '#FDE7E4',
      brand: '#FF8C82',
      onBrand: '#2B0706',
      brandInk: '#FF9D94',
    },
  },
  pink: {
    name: 'Hibiscus',
    describe: 'Rose, with deep teal buttons',
    light: {
      page: '#FDF0F5',
      card: '#FFFFFF',
      tile: '#F8DCE7',
      border: '#EFC7D8',
      ink: '#2E0C1B',
      muted: '#7E4D66',
      hero: '#F4B2CD',
      onHero: '#2E0C1B',
      brand: '#0E6962',
      onBrand: '#FFFFFF',
      brandInk: '#0E6962',
    },
    dark: {
      page: '#1C0E15',
      card: '#27141E',
      tile: '#341B29',
      border: '#472638',
      ink: '#FBE9F1',
      muted: '#CC9DB4',
      hero: '#5C1B3C',
      onHero: '#FCE4EF',
      brand: '#5FD3C6',
      onBrand: '#06201D',
      brandInk: '#6EDDD0',
    },
  },
  purple: {
    name: 'Plum',
    describe: 'Lavender, with deep plum buttons',
    light: {
      page: '#F4F0FA',
      card: '#FFFFFF',
      tile: '#E5DCF3',
      border: '#D6CAEC',
      ink: '#1D1030',
      muted: '#5F5278',
      hero: '#CBB6EC',
      onHero: '#1D1030',
      brand: '#5B2C83',
      onBrand: '#FFFFFF',
      brandInk: '#5B2C83',
    },
    dark: {
      page: '#140F1D',
      card: '#1C1528',
      tile: '#271E37',
      border: '#362948',
      ink: '#F0EAF8',
      muted: '#AFA3C5',
      hero: '#3D2463',
      onHero: '#EEE5FA',
      brand: '#C9A2F5',
      onBrand: '#1D0B33',
      brandInk: '#D2B1F7',
    },
  },
  blue: {
    name: 'Sky',
    describe: 'Pale sky, with burnt orange buttons',
    light: {
      page: '#EDF3FC',
      card: '#FFFFFF',
      tile: '#D8E5F7',
      border: '#C3D5EF',
      ink: '#0E1B33',
      muted: '#4B5D7C',
      hero: '#A8C5EE',
      onHero: '#0E1B33',
      brand: '#B04E0E',
      onBrand: '#FFFFFF',
      brandInk: '#A3480D',
    },
    dark: {
      page: '#0C1322',
      card: '#121C30',
      tile: '#1B273E',
      border: '#273550',
      ink: '#E7EEFA',
      muted: '#9CADC9',
      hero: '#1B3566',
      onHero: '#E4ECFB',
      brand: '#FF9F5A',
      onBrand: '#2A1203',
      brandInk: '#FFAE73',
    },
  },
  teal: {
    name: 'Lagoon',
    describe: 'Aqua, with coral buttons',
    light: {
      page: '#EAF6F5',
      card: '#FFFFFF',
      tile: '#D2ECE9',
      border: '#BBDEDA',
      ink: '#0B2523',
      muted: '#476966',
      hero: '#9ED5CF',
      onHero: '#0B2523',
      brand: '#BD3F37',
      onBrand: '#FFFFFF',
      brandInk: '#B03A33',
    },
    dark: {
      page: '#0A1817',
      card: '#102221',
      tile: '#182F2D',
      border: '#23413E',
      ink: '#E4F4F2',
      muted: '#99BBB7',
      hero: '#134440',
      onHero: '#E0F5F2',
      brand: '#FF8A7A',
      onBrand: '#2A0A06',
      brandInk: '#FF9B8D',
    },
  },
  green: {
    name: 'Palm',
    describe: 'Mint, with ochre gold buttons',
    light: {
      page: '#EEF6EF',
      card: '#FFFFFF',
      tile: '#D9EBDC',
      border: '#C4DDC9',
      ink: '#0F2416',
      muted: '#4B6853',
      hero: '#A7D2B1',
      onHero: '#0F2416',
      brand: '#9A6200',
      onBrand: '#FFFFFF',
      brandInk: '#8A5800',
    },
    dark: {
      page: '#0D1811',
      card: '#13221A',
      tile: '#1C2F23',
      border: '#274130',
      ink: '#E8F4EC',
      muted: '#9FBAA7',
      hero: '#1F4A2E',
      onHero: '#E6F5EA',
      brand: '#F2B83A',
      onBrand: '#1F1703',
      brandInk: '#F4C45A',
    },
  },
  gold: {
    name: 'Shea',
    describe: 'Butter yellow, with cocoa buttons',
    light: {
      page: '#FFF8E1',
      card: '#FFFFFF',
      tile: '#FAEBB6',
      border: '#EEDB9C',
      ink: '#2A2008',
      muted: '#6B5D30',
      hero: '#F8D66A',
      onHero: '#2A2008',
      brand: '#3D2B1F',
      onBrand: '#FFF6DC',
      brandInk: '#7A4A0E',
    },
    dark: {
      page: '#17130A',
      card: '#211B0F',
      tile: '#2D2515',
      border: '#3D321C',
      ink: '#FAF1D8',
      muted: '#BFB088',
      hero: '#5A4610',
      onHero: '#FFF3CC',
      brand: '#F5C542',
      onBrand: '#2A1F05',
      brandInk: '#F7CF5E',
    },
  },
};

/** How much button colour the chosen-state fill has over a card (globals.css `--brand-tint`). */
export const BRAND_TINT_PERCENT = { light: 14, dark: 20 } as const;
