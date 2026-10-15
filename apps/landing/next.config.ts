import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The About page became part of Who it's for (user request, 15 Oct); old links still land there.
  async redirects() {
    return [{ source: '/about', destination: '/who-its-for', permanent: true }];
  },
};

export default nextConfig;
