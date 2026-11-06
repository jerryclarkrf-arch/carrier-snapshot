import type { NextConfig } from "next";

// Provisional mount point for the separate load-tracking app until a
// dedicated subdomain (e.g. loadtrack.turbofreightllc.com) exists.
// A real path mount is not possible: the second Next app would collide on
// /_next assets and its auth client is hardwired to /api/auth at the origin.
const TRACKING_URL = "https://carrier-tracking.vercel.app";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/tracking", destination: TRACKING_URL, permanent: false },
      { source: "/tracking/:path*", destination: `${TRACKING_URL}/:path*`, permanent: false },
    ];
  },
};

export default nextConfig;

