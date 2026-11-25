import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const CLI = '/home/danamon/.npm/_npx/b118335b4cfa220d/node_modules/.bin/supabase'
const PROJECT = '/home/danamon/iabooks-private/replica/project'

export function localCredentials() {
  const env = readFileSync('.env.local', 'utf8')
  if (!/^IABOOKS_LOCAL_REPLICA=1$/m.test(env)) throw new Error('Solo se permite la réplica local')
  const output = execFileSync(CLI, ['status', '--workdir', PROJECT, '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const values = Object.fromEntries(output.split(/\r?\n/).filter(line => line.includes('=')).map(line => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')]
  }))
  if (values.API_URL !== 'http://127.0.0.1:54431' || !values.SERVICE_ROLE_KEY || !values.ANON_KEY || !values.JWT_SECRET) {
    throw new Error('Destino local o credenciales no disponibles')
  }
  return values
}
