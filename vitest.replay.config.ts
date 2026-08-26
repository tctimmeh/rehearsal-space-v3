import base from './vitest.config'

/**
 * The tuner's replay check, which is kept out of the ordinary suite because it
 * decodes fourteen megabytes of guitar. `npm run test:tuner`.
 */
export default {
  ...base,
  test: { ...base.test, include: ['fixtures/**/*.test.ts'], testTimeout: 300_000 }
}
