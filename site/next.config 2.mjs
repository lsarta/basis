/** @type {import('next').NextConfig} */
const nextConfig = {
  // The site serves ONLY baked-in precomputed data (data/headline.ts) — no runtime data
  // fetching, no live SODA calls. A fully static export is correct and demo-safe.
  reactStrictMode: true,
};

export default nextConfig;
