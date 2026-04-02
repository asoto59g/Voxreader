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
  }
}
module.exports = nextConfig
