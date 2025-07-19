module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/unit/**/*.test.js'],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/frontend/public/**',
        '!**/node_modules/**'
    ],
    coverageDirectory: 'coverage',
    testTimeout: 10000,
    verbose: true
};