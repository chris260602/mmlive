import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
};

export default withSentryConfig(
  nextConfig,
  {
    silent: true,
    org: "sgsmtech-eq",
    project: "mmlive-nextjs",
    widenClientFileUpload: true,
    tunnelRoute: "/monitoring",
    disableLogger: true,
    authToken: process.env.SENTRY_AUTH_TOKEN,
  }
);