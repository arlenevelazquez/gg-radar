import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright + the Sparticuz chromium binary are large native modules that
  // must not be traced into the serverless bundle. Next ships them as part of
  // the function's filesystem instead.
  serverExternalPackages: ["playwright", "playwright-core", "@sparticuz/chromium"],
};

export default nextConfig;
