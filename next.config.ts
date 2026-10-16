import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/v1/auth/:path*", destination: "/api/auth/:path*" },
        { source: "/v1/admin/:path*", destination: "/api/admin/:path*" },
        { source: "/v1/user/:path*", destination: "/api/user/:path*" },
        { source: "/v1/privacy/:path*", destination: "/api/privacy/:path*" },
        { source: "/v1/profile/:path*", destination: "/api/profile/:path*" },
        { source: "/v1/public/:path*", destination: "/api/public/:path*" },
        { source: "/v1/internal/:path*", destination: "/api/internal/:path*" },
        { source: "/v1/projects/:path*", destination: "/api/v1/projects/:path*" },
        { source: "/v1/countries", destination: "/api/countries" },
        { source: "/v1/sectors", destination: "/api/sectors" },
      ],
    };
  },
};

export default nextConfig;
