const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enhanced logging for development
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  // Empty turbopack config to silence Next.js 16 warning
  // We use webpack config for R3F externals and native modules
  turbopack: {},
  // Optimize file watching for local development
  // Use native file system events on Windows (no polling needed)
  // Only use polling when explicitly set (e.g., in Docker)
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // Use native file watching for local dev, polling only for Docker
      if (process.env.WATCHPACK_POLLING === 'true') {
        // Docker environment: use polling
        config.watchOptions = {
          poll: 1000,
          aggregateTimeout: 300,
          ignored: [
            '**/node_modules/**',
            '**/.next/**',
            '**/data/**',
            '**/*.log',
            '**/*.jsonl',
            '**/.git/**',
            '**/artifacts/**',
            '**/test-results/**',
            '**/playwright-report/**',
            '**/coverage/**',
            '**/robot/**',
            '**/services/**',
            '**/*.tsbuildinfo',
          ],
        };
      } else {
        // Local development: use native file system events (faster)
        config.watchOptions = {
          aggregateTimeout: 300,
          ignored: [
            '**/node_modules/**',
            '**/.next/**',
            '**/data/**',
            '**/*.log',
            '**/*.jsonl',
            '**/.git/**',
            '**/artifacts/**',
            '**/test-results/**',
            '**/playwright-report/**',
            '**/coverage/**',
            '**/robot/**',
            '**/services/**',
            '**/*.tsbuildinfo',
          ],
        };
      }
    }
    
    // Mark R3F as external for server-side to prevent evaluation issues
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@react-three/fiber': false,
        '@react-three/drei': false,
        '@react-three/postprocessing': false,
        '@react-spring/three': false,
      };
    }
    
    // Mark native modules as external to prevent client-side bundling
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'serialport': false,
        '@serialport/parser-readline': false,
        '@serialport/bindings-cpp': false,
      };
    }
    
    // Ensure correct module resolution for native modules on server
    if (isServer) {
      // Add project root to module resolution
      config.resolve.modules = [
        path.join(__dirname, 'node_modules'),
        'node_modules',
      ];
      
      // Ensure native modules resolve from project directory
      config.resolve.alias = {
        ...config.resolve.alias,
        '@serialport/bindings-cpp': path.resolve(__dirname, 'node_modules/@serialport/bindings-cpp'),
      };
    }
    
    return config;
  },
};

module.exports = nextConfig;

