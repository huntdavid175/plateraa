import type { MetadataRoute } from 'next';

import { SITE_URL } from '../lib/site';

const PAGES = ['', '/features', '/pricing', '/about', '/contact', '/privacy', '/terms'];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: 'monthly',
    priority: path === '' ? 1 : path === '/privacy' || path === '/terms' ? 0.3 : 0.8,
  }));
}
