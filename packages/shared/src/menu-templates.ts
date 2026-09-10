import type { Station, VendorType } from './enums.js';

/**
 * Starter menus picked during onboarding. They carry names only: the owner types their own
 * prices into the price grid, because prices vary too much between vendors to guess.
 */

export interface TemplateModifierGroup {
  key: string;
  name: string;
  minSelect: number;
  maxSelect: number | null;
  options: readonly string[];
}

export interface TemplateItem {
  name: string;
  station?: Station;
  /** e.g. sizes; each variant gets its own price in the grid. */
  variants?: readonly string[];
  /** Keys of the template's modifier groups this item offers. */
  modifierGroups?: readonly string[];
}

export interface TemplateCategory {
  name: string;
  items: readonly TemplateItem[];
}

export interface MenuTemplate {
  label: string;
  categories: readonly TemplateCategory[];
  modifierGroups: readonly TemplateModifierGroup[];
}

const protein: TemplateModifierGroup = {
  key: 'protein',
  name: 'Protein',
  minSelect: 0,
  maxSelect: 3,
  options: ['Chicken', 'Beef', 'Fish', 'Egg', 'Wele'],
};

const extras: TemplateModifierGroup = {
  key: 'extras',
  name: 'Extras',
  minSelect: 0,
  maxSelect: null,
  options: ['Extra shito', 'Extra stew', 'Gari', 'Plantain', 'Salad'],
};

const drinks: TemplateCategory = {
  name: 'Drinks',
  items: [
    { name: 'Sobolo', station: 'DRINKS' },
    { name: 'Bottled water', station: 'DRINKS' },
    { name: 'Soft drink', station: 'DRINKS' },
    { name: 'Malt', station: 'DRINKS' },
  ],
};

const juiceSizes = ['Small', 'Large'] as const;

export const MENU_TEMPLATES: Record<VendorType, MenuTemplate> = {
  CHOP_BAR: {
    label: 'Chop bar / local food',
    modifierGroups: [protein, extras],
    categories: [
      {
        name: 'Rice',
        items: [
          { name: 'Jollof rice', modifierGroups: ['protein', 'extras'] },
          { name: 'Fried rice', modifierGroups: ['protein', 'extras'] },
          { name: 'Plain rice & stew', modifierGroups: ['protein', 'extras'] },
          { name: 'Waakye', modifierGroups: ['protein', 'extras'] },
          { name: 'Red red', modifierGroups: ['protein', 'extras'] },
        ],
      },
      {
        name: 'Swallows',
        items: [
          { name: 'Banku & tilapia', modifierGroups: ['extras'] },
          { name: 'Banku & okro soup', modifierGroups: ['protein'] },
          { name: 'Fufu & light soup', modifierGroups: ['protein'] },
          { name: 'Fufu & groundnut soup', modifierGroups: ['protein'] },
          { name: 'Kenkey & fish', modifierGroups: ['extras'] },
        ],
      },
      { ...drinks, items: [...drinks.items, { name: 'Asaana', station: 'DRINKS' }] },
    ],
  },

  FAST_FOOD: {
    label: 'Fast food / takeaway',
    modifierGroups: [protein, extras],
    categories: [
      {
        name: 'Mains',
        items: [
          { name: 'Fried rice & chicken', modifierGroups: ['extras'] },
          { name: 'Jollof & chicken', modifierGroups: ['extras'] },
          { name: 'Assorted fried rice', modifierGroups: ['extras'] },
          { name: 'Assorted jollof', modifierGroups: ['extras'] },
          { name: 'Assorted noodles', modifierGroups: ['protein'] },
          { name: 'Chips & chicken' },
          { name: 'Shawarma', variants: ['Chicken', 'Beef'] },
          { name: 'Burger' },
        ],
      },
      {
        name: 'Sides',
        items: [
          { name: 'Fries' },
          { name: 'Kelewele' },
          { name: 'Coleslaw' },
          { name: 'Grilled chicken' },
        ],
      },
      drinks,
    ],
  },

  CAFE_BAKERY: {
    label: 'Café / bakery',
    modifierGroups: [],
    categories: [
      {
        name: 'Bakery',
        items: [
          { name: 'Meat pie' },
          { name: 'Sausage roll' },
          { name: 'Doughnut' },
          { name: 'Bofrot' },
          { name: 'Sugar bread' },
          { name: 'Tea bread' },
          { name: 'Cake slice' },
        ],
      },
      {
        name: 'Hot drinks',
        items: [
          { name: 'Tea', station: 'DRINKS' },
          { name: 'Coffee', station: 'DRINKS' },
          { name: 'Hot Milo', station: 'DRINKS' },
        ],
      },
      drinks,
    ],
  },

  JUICE: {
    label: 'Juice / smoothies',
    modifierGroups: [],
    categories: [
      {
        name: 'Fresh juice',
        items: [
          'Pineapple',
          'Watermelon',
          'Orange',
          'Mango',
          'Pineapple & ginger',
          'Mixed fruit',
          'Sobolo',
          'Asaana',
        ].map((name) => ({ name, station: 'DRINKS' as const, variants: juiceSizes })),
      },
      {
        name: 'Smoothies',
        items: [
          { name: 'Banana smoothie', station: 'DRINKS', variants: juiceSizes },
          { name: 'Mixed fruit smoothie', station: 'DRINKS', variants: juiceSizes },
        ],
      },
      { name: 'Snacks', items: [{ name: 'Fruit salad' }] },
    ],
  },

  CLOUD_KITCHEN: {
    label: 'Cloud kitchen / Instagram brand',
    modifierGroups: [protein, extras],
    categories: [
      {
        name: 'Specials',
        items: [
          { name: 'Jollof special', modifierGroups: ['protein', 'extras'] },
          { name: 'Fried rice special', modifierGroups: ['protein', 'extras'] },
          { name: 'Waakye special', modifierGroups: ['protein', 'extras'] },
          { name: 'Banku & grilled tilapia', modifierGroups: ['extras'] },
          { name: 'Assorted noodles', modifierGroups: ['protein'] },
        ],
      },
      {
        name: 'Sides',
        items: [{ name: 'Grilled chicken' }, { name: 'Kelewele' }, { name: 'Fries' }],
      },
      drinks,
    ],
  },

  FOOD_TRUCK: {
    label: 'Food truck / stall',
    modifierGroups: [extras],
    categories: [
      {
        name: 'Food',
        items: [
          { name: 'Shawarma', variants: ['Chicken', 'Beef'] },
          { name: 'Hot dog' },
          { name: 'Chichinga (kebab)' },
          { name: 'Grilled chicken', modifierGroups: ['extras'] },
          { name: 'Fries' },
        ],
      },
      drinks,
    ],
  },

  OTHER: {
    label: 'Start from scratch',
    modifierGroups: [],
    categories: [],
  },
};
