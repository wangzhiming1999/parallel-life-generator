import postgres from 'postgres'
import { readFile } from 'node:fs/promises'

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
if (!connectionString) throw new Error('Missing Postgres connection string')

const sql = postgres(connectionString, { max: 1 })
const migration = await readFile(new URL('../supabase/migrations/20260906190000_create_drifting_archives.sql', import.meta.url), 'utf8')
await sql.unsafe(migration)
const [{ count }] = await sql`select count(*)::int as count from public.drifting_archives`
await sql.end()
console.log(`Drifting archives migration applied; ${count} public archives available`)
