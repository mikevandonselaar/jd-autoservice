import { existsSync } from 'node:fs'

/** Loads .env.test when it exists. Variables already set in the shell win. */
export function loadTestEnv() {
  if (existsSync('.env.test')) process.loadEnvFile('.env.test')
}

export function requireEnv(...names) {
  const missing = names.filter((name) => !process.env[name])
  if (missing.length > 0) {
    console.error(`Missing in .env.test: ${missing.join(', ')} (see .env.example)`)
    process.exit(2)
  }
}

/**
 * The test scripts write data and run destructive checks, so they only ever talk to the
 * test project: every target must contain the test ref and never the production ref.
 */
export function assertTestTarget(...targets) {
  const test = process.env.TEST_PROJECT_REF
  const production = process.env.PRODUCTION_PROJECT_REF
  const refuse = (reason) => {
    console.error(`Refusing to run: ${reason}`)
    process.exit(2)
  }

  if (production && test === production) refuse('TEST_PROJECT_REF equals PRODUCTION_PROJECT_REF.')
  for (const target of targets) {
    if (!target.includes(test)) refuse('a target does not belong to TEST_PROJECT_REF.')
    if (production && target.includes(production)) refuse('a target points at the production project.')
  }
}
