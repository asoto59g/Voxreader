/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000']
    }
  },
  webpack: (config) => {
    config.resolve.alias['@'] = path.join(__dirname)
    config.resolve.alias.canvas = false
    config.resolve.alias.encoding = false
    return config
  },
  headers: async () => {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-store' }
        ]
      }
    ]
  }
}
module.exports = nextConfig
