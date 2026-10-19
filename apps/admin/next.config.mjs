/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.ADMIN_DIST_DIR || '.next',
  transpilePackages: ['@hermes/shared'],
  reactStrictMode: true,
};

export default nextConfig;
