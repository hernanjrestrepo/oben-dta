import type { NextConfig } from "next";

// Destino del proxy /api → backend. Se fija al compilar (docker: http://backend:3004).
const BACKEND = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:3004';

const nextConfig: NextConfig = {
  turbopack: {},
  experimental: {
    // MIA (180 s) y las consultas en vivo a Oben (90 s) tardan más que el default de 30 s.
    proxyTimeout: 190_000,
    proxyClientMaxBodySize: '50mb',
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND}/:path*` }];
  },
};

export default nextConfig;
