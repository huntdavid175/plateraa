/**
 * The site's stock photos, from Unsplash (picked by the user, 15 Oct). The files are in
 * public/photos/, resized and compressed to WebP from the originals. Unsplash's licence allows
 * commercial use without credit; the footer credits the photographers anyway. These people aren't
 * Plateraa customers, so a photo must never be presented as a testimonial.
 */
export interface Photo {
  src: string;
  /** What the photo shows, for screen readers. */
  alt: string;
  /** Where to keep the subject when the frame crops the photo (CSS object-position). */
  position?: string;
  by: string;
  byUrl: string;
}

export const PHOTOS = {
  homeHero: {
    src: '/photos/home-hero.webp',
    alt: 'A food vendor in an apron checks his phone beside the grill at his stall',
    position: '70% 35%',
    by: 'Ali Mkumbwa',
    byUrl: 'https://unsplash.com/@mkumbwajr',
  },
  homeRush: {
    src: '/photos/home-rush.webp',
    alt: 'A cook works a smoky grill at night while customers wait',
    by: 'Seyiram Kweku',
    byUrl: 'https://unsplash.com/@seyiram',
  },
  homeSetupPhone: {
    src: '/photos/home-setup-phone.webp',
    alt: 'A woman at her juice stand looks at her phone',
    position: '55% 40%',
    by: 'Ali Mkumbwa',
    byUrl: 'https://unsplash.com/@mkumbwajr',
  },
  homeSetupTablet: {
    src: '/photos/home-setup-tablet.webp',
    alt: 'Hands using a tablet on a bakery counter',
    by: 'DJ Paine',
    byUrl: 'https://unsplash.com/@djpaine',
  },
  homeMoney: {
    src: '/photos/home-money.webp',
    alt: 'A customer holds out a phone to pay at a stall of oranges',
    by: 'Yoco Photography',
    byUrl: 'https://unsplash.com/@yocoproduction',
  },
  featuresHero: {
    src: '/photos/features-hero.webp',
    alt: 'A woman serves plates of food in warm evening light',
    position: '50% 35%',
    by: 'Peter Kalonji',
    byUrl: 'https://unsplash.com/@petertk',
  },
  aboutHero: {
    src: '/photos/about-hero.webp',
    alt: 'A smiling vendor in a headscarf at her stall',
    position: '50% 25%',
    by: 'Ali Mkumbwa',
    byUrl: 'https://unsplash.com/@mkumbwajr',
  },
  typeChopBar: {
    src: '/photos/type-chop-bar.webp',
    alt: 'A plate of fufu, plantain and chicken with bowls of soup',
    by: 'Gourmet Lenz',
    byUrl: 'https://unsplash.com/@gourmetlenz',
  },
  typeRice: {
    src: '/photos/type-rice.webp',
    alt: 'Rice with fried chicken, pepper sauce and a boiled egg',
    by: 'Kevin kevin',
    byUrl: 'https://unsplash.com/@0x00kevin',
  },
  typeFastFood: {
    src: '/photos/type-fast-food.webp',
    alt: 'Fried chicken on a tray of rice',
    by: 'Dr Muhammad Amer',
    byUrl: 'https://unsplash.com/@drxyz',
  },
  typeGrill: {
    src: '/photos/type-grill.webp',
    alt: 'A grilled tilapia on a banana leaf',
    by: 'Michael Lock',
    byUrl: 'https://unsplash.com/@milo_photo',
  },
  typeStreetFood: {
    src: '/photos/type-street-food.webp',
    alt: 'A street vendor lifts fried snacks out of a pan over a fire',
    by: 'Emmanuel Offei',
    byUrl: 'https://unsplash.com/@immanuel_offei',
  },
  typeCafe: {
    src: '/photos/type-cafe.webp',
    alt: 'Bread and pastries on the shelves of a bakery counter',
    by: 'Yeh Xintong',
    byUrl: 'https://unsplash.com/@blsnki',
  },
  typeJuice: {
    src: '/photos/type-juice.webp',
    alt: 'A row of bottled fruit juices at a market stall',
    by: 'Hailey Tong',
    byUrl: 'https://unsplash.com/@haileytong',
  },
  typeCloudKitchen: {
    src: '/photos/type-cloud-kitchen.webp',
    alt: 'A takeaway box of food ready for delivery',
    by: 'Ambitious Studio* | Rick Barrett',
    byUrl: 'https://unsplash.com/@weareambitious',
  },
} satisfies Record<string, Photo>;
