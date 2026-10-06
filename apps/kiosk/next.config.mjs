/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.KIOSK_DIST_DIR || '.next',
  transpilePackages: ['@hermes/shared'],
  reactStrictMode: true,
};

export default nextConfig;
