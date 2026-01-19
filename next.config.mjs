/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use .next_build locally to avoid Windows permission issues, but standard .next on Netlify
  distDir: process.env.NETLIFY ? '.next' : '.next_build',
  experimental: {
    serverActions: {
      allowedOrigins: []
    }
  }
};

export default nextConfig;
