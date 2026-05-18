import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nextBin = require.resolve('next/dist/bin/next')
const env = { ...process.env, NODE_ENV: 'production' }

const result = spawnSync(
  process.execPath,
  [nextBin, 'build', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env,
  },
)

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
