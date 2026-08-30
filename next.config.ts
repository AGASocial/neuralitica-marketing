import type { NextConfig } from "next";
import { MANUAL_UPLOAD_SERVER_ACTION_BODY_LIMIT } from "@/lib/contracts/manual-video-upload";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: MANUAL_UPLOAD_SERVER_ACTION_BODY_LIMIT,
    },
  },
  async headers() {
    return [
      {
        source: "/reset-password/new",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/dashboard",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/dashboard/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/interview",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/interview/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/profile",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/profile/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/settings",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/settings/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/pending",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
