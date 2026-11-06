// Runs the pgTAP files in supabase/tests against the TEST project and checks the TAP output.
// Same files as `supabase test db`, but without Docker. Usage: npm run test:db
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { assertTestTarget, loadTestEnv, requireEnv } from './lib/env.mjs'

loadTestEnv()
requireEnv('TEST_PROJECT_REF', 'TEST_DATABASE_URL')
assertTestTarget(process.env.TEST_DATABASE_URL)

const testDir = 'supabase/tests'
const files = readdirSync(testDir)
  .filter((name) => name.endsWith('.test.sql'))
  .sort()

const client = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL,
  // The Supabase pooler does not present a certificate our trust store knows. The target is
  // pinned to the test project above and the connection string holds the database password.
  ssl: { rejectUnauthorized: false },
})
await client.connect()

let failed = false

try {
  // The tests would be meaningless against a database that lacks our migrations.
  const applied = await client
    .query('select version from supabase_migrations.schema_migrations')
    .then((result) => new Set(result.rows.map((row) => row.version)))
    .catch(() => null)
  const local = readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('.sql'))
    .map((name) => name.split('_')[0])
  const missing = applied ? local.filter((version) => !applied.has(version)) : local
  if (missing.length > 0) {
    console.error(`Migrations not applied to the test project: ${missing.join(', ')}`)
    console.error('Run: npx supabase db push --db-url "<TEST_DATABASE_URL>" (see README)')
    process.exit(2)
  }

  await client.query('create extension if not exists pgtap with schema extensions')

  for (const file of files) {
    console.log(`\n# ${file}`)
    let results
    try {
      results = await client.query(readFileSync(join(testDir, file), 'utf8'))
    } catch (error) {
      await client.query('rollback').catch(() => {})
      console.error(`not ok - ${file} aborted: ${error.message}`)
      failed = true
      continue
    }

    // A multi-statement query returns one result per statement. Each pgTAP function returns TAP text.
    const lines = (Array.isArray(results) ? results : [results])
      .flatMap((result) => result.rows.map((row) => Object.values(row)[0]))
      .filter((value) => typeof value === 'string' && value !== '')
      .flatMap((value) => value.split('\n'))

    const planned = lines.map((line) => /^1\.\.(\d+)$/.exec(line)).find(Boolean)
    const passed = lines.filter((line) => /^ok \d+/.test(line)).length
    const failures = lines.filter((line) => /^not ok \d+/.test(line)).length

    for (const line of lines) if (/^(not )?ok \d+|^#/.test(line)) console.log(line)

    if (!planned) {
      console.error(`not ok - ${file} has no plan`)
      failed = true
    } else if (Number(planned[1]) !== passed + failures) {
      console.error(`not ok - ${file} planned ${planned[1]} tests but ran ${passed + failures}`)
      failed = true
    }
    if (failures > 0) failed = true
    console.log(`# ${passed} passed, ${failures} failed`)
  }
} finally {
  await client.end()
}

process.exit(failed ? 1 : 0)
