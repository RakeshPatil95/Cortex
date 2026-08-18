const { defineConfig } = require('vitest/config');
const path = require('path');

const integration = process.env.INTEGRATION === '1';

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: integration
      ? ['tests/**/*.integration.test.js']
      : ['tests/**/*.test.js'],
    exclude: integration
      ? ['node_modules', '.next']
      : ['node_modules', '.next', 'tests/**/*.integration.test.js'],
    testTimeout: integration ? 30000 : 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
