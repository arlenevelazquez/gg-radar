import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright + the Sparticuz chromium binary are large native modules that
  // must not be traced into the serverless bundle. Next ships them as part of
  // the function's filesystem instead.
  serverExternalPackages: ["playwright", "playwright-core", "@sparticuz/chromium"],

  // Next's automatic file tracing only includes files referenced by static
  // `import`s. Playwright reads `browsers.json` (and other files under its
  // package root) dynamically at launch, so we have to opt them into the
  // function bundle explicitly. Sparticuz's chromium binary lives under its
  // `bin/` directory and needs the same treatment.
  outputFileTracingIncludes: {
    "/api/radar/export/**/*": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium/**/*",
    ],
  },
};

export default nextConfig;
