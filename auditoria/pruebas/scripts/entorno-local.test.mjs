import test from 'node:test'
import assert from 'node:assert/strict'
import { validarUrlLocal } from './entorno-local.mjs'

test('admite las raíces locales usadas por Supabase', () => {
  for (const url of ['http://127.0.0.1:54321', 'http://localhost:54321/', 'http://[::1]:54321']) {
    assert.equal(validarUrlLocal(url), new URL(url).origin)
  }
})

test('rechaza destinos remotos y URLs que solo contienen localhost en otra parte', () => {
  for (const url of ['https://example.com', 'https://127.0.0.1.example.com',
    'https://localhost@example.com', 'https://example.com/localhost',
    'http://localhost:54321/?redirect=https://example.com', 'file:///localhost',
    'http://user:pass@localhost:54321', 'http://localhost:54321/rest/v1', 'invalid']) {
    assert.throws(() => validarUrlLocal(url))
  }
})
