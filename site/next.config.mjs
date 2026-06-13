/** @type {import('next').NextConfig} */
const nextConfig = {
  // The site serves ONLY baked-in precomputed data (data/headline.ts) — no runtime data
  // fetching, no live SODA calls. A fully static export is correct and demo-safe.
  reactStrictMode: true,
  // Repo root has its own package.json (the engine); pin tracing to the site dir so Next
  // doesn't infer the parent workspace and mis-root the build.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
