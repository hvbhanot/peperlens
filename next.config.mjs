/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PDFs are uploaded as multipart form-data to a route handler; bump the
  // body size budget for server actions in case they're used later.
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
