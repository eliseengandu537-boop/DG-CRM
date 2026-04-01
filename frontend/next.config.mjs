/** @type {import('next').NextConfig} */
const nextConfig = {
  onDemandEntries: {
    // Keep dev routes in memory longer to reduce first-hit chunk misses.
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 10,
  },
  webpack: (config, { dev }) => {
    // Prevent stale/corrupt cached chunk graphs in local dev.
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
