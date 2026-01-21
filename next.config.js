/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Docker部署优化
  output: 'standalone',
}

module.exports = nextConfig
