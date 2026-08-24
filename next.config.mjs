/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Uploaded files are served through an authenticated route handler, not statically.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
