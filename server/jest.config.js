/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  // Nest decorators need reflect-metadata before any DTO module is loaded.
  setupFiles: ['reflect-metadata'],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.json', diagnostics: { ignoreCodes: [151002] } },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/app.module.ts',
    '!src/app.setup.ts',
  ],
  coverageDirectory: '../coverage',
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
};
