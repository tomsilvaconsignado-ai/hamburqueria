// Aplica as migrações de supabase/migrations (em ordem) e o seed num Postgres real
// (PGlite, em memória), com stubs mínimos de auth/storage/pgcrypto do Supabase,
// e testa as regras agindo como cada papel (anon / authenticated + JWT).
//
//   npm install --no-save @electric-sql/pglite@0.2.17
//   npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import fs from 'fs';

const dir = new URL('../migrations/', import.meta.url);
const migrations = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
const db = new PGlite({ extensions: { uuid_ossp } });

// O PGlite não traz o pgcrypto: digest e gen_random_bytes são recriados com funções nativas.
const stubs = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Padrão do Supabase: tudo que é criado em public já nasce liberado para os papéis da API
-- (a proteção vem do RLS e dos REVOKE explícitos das migrações).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
CREATE SCHEMA extensions; GRANT USAGE ON SCHEMA extensions TO anon, authenticated;
CREATE FUNCTION extensions.digest(data text, alg text) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$ SELECT sha256(convert_to(data, 'UTF8')) $$;
CREATE FUNCTION extensions.gen_random_bytes(n int) RETURNS bytea LANGUAGE sql VOLATILE AS $$
  SELECT substring(decode(string_agg(md5(random()::text), ''), 'hex') FROM 1 FOR n) FROM generate_series(1, (n / 16) + 1) $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO anon, authenticated;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb, email_confirmed_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(auth.jwt() ->> 'role', 'anon') $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated;
CREATE SCHEMA storage; GRANT USAGE ON SCHEMA storage TO anon, authenticated;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, bucket_id text, name text, owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
CREATE PUBLICATION supabase_realtime;
`;

export const ids = {
  admin: '00000000-0000-0000-0000-00000000000a',
  kitchen: '00000000-0000-0000-0000-00000000000c',
  courier: '00000000-0000-0000-0000-00000000000d',
  ana: '00000000-0000-0000-0000-000000000001',
  bia: '00000000-0000-0000-0000-000000000002',
};

let failures = 0;
const ok = (msg) => console.log('  ✔', msg);
const bad = (msg) => { failures++; console.log('  ✘', msg); };

async function as(uid, sql, params = []) {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`,
    [uid ?? '', JSON.stringify(uid ? { sub: uid, role: 'authenticated' } : { role: 'anon' })]);
  await db.exec(uid ? 'SET ROLE authenticated' : 'SET ROLE anon');
  try { return await db.query(sql, params); } finally { await db.exec('RESET ROLE'); }
}
async function expectFail(label, uid, sql, params) {
  try { const r = await as(uid, sql, params);
    if (r.affectedRows === 0 && /^\s*(update|delete)/i.test(sql)) ok(label + ' (0 linhas afetadas)');
    else bad(label + ' — deveria falhar, mas passou'); }
  catch (e) { ok(label + ' → ' + e.message.split('\n')[0]); }
}
async function expectOk(label, uid, sql, params) {
  try { const r = await as(uid, sql, params); ok(label); return r; }
  catch (e) { bad(label + ' — erro: ' + e.message); return null; }
}
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];

await db.exec(stubs);
await db.exec(`SET search_path = public, extensions`);
// pgcrypto já está simulado em extensions (ver stubs)
const migration = (f) => fs.readFileSync(new URL(f, dir), 'utf8').replace(/CREATE EXTENSION IF NOT EXISTS "?pgcrypto"?[^;]*;/gi, '');
console.log('Migrações');
for (const f of migrations) {
  try { await db.exec(migration(f)); ok(f); }
  catch (e) { bad(f + ' — ' + e.message); process.exit(1); }
}
await db.exec(fs.readFileSync(new URL('../seed.sql', import.meta.url), 'utf8'));
ok('seed.sql');
console.log('Reaplicar as migrações novas (idempotência)');
for (const f of migrations.filter(m => m >= '20261101')) {
  try { await db.exec(migration(f)); ok(f); }
  catch (e) { bad(f + ' (2ª vez) — ' + e.message); }
}

// Cenário: admin, cozinha, entregador e duas clientes
const user = (id, email, name, phone) => db.query(`INSERT INTO auth.users VALUES ($1, $2, $3, now())`,
  [id, email, JSON.stringify({ full_name: name, phone })]);
await user(ids.admin, 'admin@x.com', 'Admin', '11900000000');
await user(ids.kitchen, 'cozinha@x.com', 'Cozinha', '11900000001');
await user(ids.courier, 'moto@x.com', 'Moto Boy', '11900000002');
await user(ids.ana, 'ana@x.com', 'Ana Souza', '(11) 98888-1111');
await user(ids.bia, 'bia@x.com', 'Bia Lima', '11977772222');
await db.query(`UPDATE profiles SET role = 'ADMIN' WHERE id = $1`, [ids.admin]);
await db.query(`UPDATE profiles SET role = 'KITCHEN' WHERE id = $1`, [ids.kitchen]);
await db.query(`UPDATE profiles SET role = 'DELIVERY' WHERE id = $1`, [ids.courier]);
const courierId = (await one(`INSERT INTO couriers (user_id, full_name, phone, whatsapp) VALUES ($1, 'Moto Boy', '11900000002', '11900000002') RETURNING id`, [ids.courier])).id;

const product = (await one(`SELECT id FROM products WHERE slug = 'classic-cheese-burger'`)).id;
const zoneNeighborhood = 'Centro';
export const payload = (extra = {}) => JSON.stringify({
  customer_name: 'Ana Souza', customer_phone: '(11) 98888-1111', fulfillment_type: 'DELIVERY',
  payment_method: 'CASH_ON_DELIVERY',
  delivery_address: { street: 'Rua A', number: '10', neighborhood: zoneNeighborhood, city: 'São Paulo', state: 'SP', postal_code: '01000-000' },
  items: [{ product_id: product, quantity: 2, options: [] }], ...extra,
});

const tests = (await import('./cases.mjs')).default;
await tests({ db, as, ok, bad, expectOk, expectFail, one, ids, courierId, product, payload });

console.log(failures ? `\n${failures} FALHA(S)` : '\nTodos os testes passaram');
process.exit(failures ? 1 : 0);
