module.exports = {
  testEnvironment: 'node',
  testTimeout: 15000,
  setupFiles: ['<rootDir>/tests/env.js'],
  globalTeardown: '<rootDir>/tests/teardown.js',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
};
