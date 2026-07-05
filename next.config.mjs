/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: {
    optimizePackageImports: ['@phosphor-icons/react'],
  },
  output: 'standalone',
  productionBrowserSourceMaps: false,
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? {
            exclude: ['error'],
          }
        : false,
  },
  images: {
    unoptimized: true,
    domains: ['localhost', '127.0.0.1'],
  },
  async redirects() {
    return [
      {
        source: '/chat/completions',
        destination: '/',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/generate',
        destination: '/api/model-servers/generate',
      },
      {
        source: '/api/chat',
        destination: '/api/model-servers/chat',
      },
      {
        source: '/v1/chat/completions',
        destination: '/api/v1/chat/completions',
      },
      {
        source: '/v1/completions',
        destination: '/api/v1/completions',
      },
      {
        source: '/v1/embeddings',
        destination: '/api/v1/embeddings',
      },
      {
        source: '/v1/rerank',
        destination: '/api/v1/rerank',
      },
      {
        source: '/v1/models',
        destination: '/api/v1/models',
      },
    ];
  },
  serverExternalPackages: ['tesseract.js', 'winston'],
  outputFileTracingIncludes: {
    '/api/**/*': [
      './node_modules/tesseract.js/**/*.wasm',
      './node_modules/tesseract.js/**/*.proto',
    ],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        url: false,
      };
    }
    return config;
  },
  turbopack: {},
};

export default nextConfig;
