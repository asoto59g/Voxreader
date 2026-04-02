/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  headers: async () => {
    return [
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-store' }]
      }
    ]
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'original-fs': false,
      'zipfile': false,
      'aws-sdk': false,
      'nock': false,
      'mock-aws-s3': false
    }
    return config
  }
}
module.exports = nextConfig
