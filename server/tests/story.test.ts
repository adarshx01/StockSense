import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
process.env.DATABASE_URL = 'postgresql://stocksense:stocksense_local@localhost:5433/stocksense_test';
process.env.NODE_ENV = 'test';
process.env.SEED_PASSWORD = 'Test-Pass-1!';
process.env.SEED_EMAIL = 'manager@stocksense.local';
process.env.SES_FROM_EMAIL = '';
process.env.LOG_LEVEL = 'silent';
process.env.PG_POOL_MAX = '4';

const adminUrl = 'postgresql://stocksense:stocksense_local@localhost:5433/stocksense';

let app: FastifyInstance;
let token = '';

async function waitForPostgres(): Promise<void> {
  let last: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const client = new pg.Client({ connectionString: adminUrl });
    try {
      await client.connect();
      await client.end();
      return;
    } catch (err) {
      last = err;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw last;
}

async function api(method: string, url: string, body?: Record<string, unknown> | unknown[], expected = 200) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await app.inject({
    method: method as 'GET',
    url,
    headers,
    payload: body as Record<string, unknown> | undefined,
  });
  if (response.statusCode !== expected) {
    throw new Error(`${method} ${url} -> ${response.statusCode} ${response.body}`);
  }
  return response.body ? response.json() : null;
}

before(async () => {
  await waitForPostgres();
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = 'stocksense_test'`);
  if (!exists.rowCount) await admin.query('CREATE DATABASE stocksense_test');
  await admin.end();

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await pool.query('GRANT ALL ON SCHEMA public TO stocksense');
  await pool.query('GRANT ALL ON SCHEMA public TO public');
  const { runMigrations } = await import('../src/db/migrate.ts');
  const { runSeed } = await import('../src/db/seed.ts');
  await runMigrations(pool);
  await runSeed(pool);
  await pool.end();

  const { buildApp } = await import('../src/app.ts');
  app = await buildApp({ logger: false });
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { loginId: 'manager', password: process.env.SEED_PASSWORD },
  });
  assert.equal(login.statusCode, 200);
  token = login.json().token as string;

  const bad = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { loginId: 'manager', password: 'wrong-password' },
  });
  assert.equal(bad.statusCode, 401);
  assert.deepEqual(bad.json(), { error: 'Invalid Login Id or Password' });
});

after(async () => {
  if (app) await app.close();
});

test('posts the inventory story once and only once', async () => {
  const health = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(health.statusCode, 200);

  const stock = await api('GET', '/api/stock?search=DESK');
  const desk = stock.find((row: { sku: string }) => row.sku === 'DESK001');
  const table = (await api('GET', '/api/stock?search=TABLE')).find((row: { sku: string }) => row.sku === 'TABLE001');
  assert.equal(desk.onHand, 50);
  assert.equal(desk.freeToUse, 45);
  assert.equal(table.onHand, 50);
  assert.equal(table.freeToUse, 50);

  const locations = await api('GET', '/api/locations');
  const stock1 = locations.find((row: { shortCode: string }) => row.shortCode === 'Stock1');
  const stock2 = locations.find((row: { shortCode: string }) => row.shortCode === 'Stock2');
  const warehouseId = stock1.warehouseId as string;

  const product = await api('POST', '/api/products', {
    name: 'Steel Rod',
    sku: 'ROD100',
    uom: 'Units',
    perUnitCost: 10,
    reorderLevel: 5,
  }, 201);

  const levels = async () => {
    const rows = await api('GET', '/api/stock?search=ROD100');
    const row = rows.find((item: { sku: string }) => item.sku === 'ROD100');
    const at = (id: string) => row.locations.find((loc: { locationId: string }) => loc.locationId === id);
    return {
      total: row.onHand as number,
      source: (at(stock1.id)?.onHand ?? 0) as number,
      dest: (at(stock2.id)?.onHand ?? 0) as number,
    };
  };

  const receipt = await api('POST', '/api/receipts', {
    warehouseId,
    destinationLocationId: stock1.id,
    contact: 'vendor',
    lines: [{ productId: product.id, quantity: 100 }],
  }, 201);
  assert.match(receipt.reference, /^WH\/IN\/\d{4}$/);
  await api('POST', `/api/receipts/${receipt.id}/confirm`);
  await api('POST', `/api/receipts/${receipt.id}/validate`);
  let qty = await levels();
  assert.equal(qty.source, 100);
  assert.equal(qty.total, 100);

  const transfer = await api('POST', '/api/transfers', {
    warehouseId,
    fromLocationId: stock1.id,
    toLocationId: stock2.id,
    contact: 'vendor',
    lines: [{ productId: product.id, quantity: 100 }],
  }, 201);
  assert.match(transfer.reference, /^WH\/INT\/\d{4}$/);
  const confirmedTransfer = await api('POST', `/api/transfers/${transfer.id}/confirm`);
  assert.equal(confirmedTransfer.status, 'ready');
  await api('POST', `/api/transfers/${transfer.id}/validate`);
  qty = await levels();
  assert.equal(qty.source, 0);
  assert.equal(qty.dest, 100);
  assert.equal(qty.total, 100);

  const delivery = await api('POST', '/api/deliveries', {
    warehouseId,
    sourceLocationId: stock2.id,
    contact: 'Azure Interior',
    lines: [{ productId: product.id, quantity: 20 }],
  }, 201);
  assert.match(delivery.reference, /^WH\/OUT\/\d{4}$/);
  const confirmedDelivery = await api('POST', `/api/deliveries/${delivery.id}/confirm`);
  assert.equal(confirmedDelivery.status, 'ready');
  await api('POST', `/api/deliveries/${delivery.id}/validate`);
  qty = await levels();
  assert.equal(qty.dest, 80);
  assert.equal(qty.total, 80);

  const adjustment = await api('POST', '/api/adjustments', {
    productId: product.id,
    locationId: stock2.id,
    countedQty: 77,
    reason: 'Damaged',
  }, 201);
  assert.match(adjustment.reference, /^WH\/ADJ\/\d{4}$/);
  assert.equal(adjustment.delta, -3);
  await api('POST', `/api/adjustments/${adjustment.id}/apply`);
  qty = await levels();
  assert.equal(qty.dest, 77);
  assert.equal(qty.total, 77);

  const second = await app.inject({
    method: 'POST',
    url: `/api/receipts/${receipt.id}/validate`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(second.statusCode, 409);
  qty = await levels();
  assert.equal(qty.source, 0);
  assert.equal(qty.dest, 77);

  const doneCancel = await app.inject({
    method: 'POST',
    url: `/api/deliveries/${delivery.id}/cancel`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(doneCancel.statusCode, 400);
  assert.equal(doneCancel.json().error, 'Done documents cannot be canceled');

  const draft = await api('POST', '/api/receipts', {
    warehouseId,
    destinationLocationId: stock1.id,
    contact: 'vendor',
    lines: [{ productId: product.id, quantity: 5 }],
  }, 201);
  const canceled = await api('POST', `/api/receipts/${draft.id}/cancel`);
  assert.equal(canceled.status, 'canceled');
  qty = await levels();
  assert.equal(qty.dest, 77);
  assert.equal(qty.total, 77);

  const short = await api('POST', '/api/deliveries', {
    warehouseId,
    sourceLocationId: stock2.id,
    contact: 'Azure Interior',
    lines: [{ productId: product.id, quantity: 100 }],
  }, 201);
  const waiting = await api('POST', `/api/deliveries/${short.id}/confirm`);
  assert.equal(waiting.status, 'waiting');
  assert.equal(waiting.lines[0].outOfStock, true);

  const cover = await api('POST', '/api/receipts', {
    warehouseId,
    destinationLocationId: stock2.id,
    contact: 'vendor',
    lines: [{ productId: product.id, quantity: 30 }],
  }, 201);
  await api('POST', `/api/receipts/${cover.id}/confirm`);
  await api('POST', `/api/receipts/${cover.id}/validate`);
  const promoted = await api('GET', `/api/deliveries/${short.id}`);
  assert.equal(promoted.status, 'ready');
  assert.equal(promoted.lines[0].outOfStock, false);
  await api('POST', `/api/deliveries/${short.id}/validate`);
  qty = await levels();
  assert.equal(qty.dest, 7);

  const moves = await api('GET', `/api/move-history?productId=${product.id}`);
  const directions = moves.map((move: { direction: string; quantity: number }) => `${move.direction}:${move.quantity}`);
  assert.ok(directions.includes('IN:100'));
  assert.ok(directions.includes('INT:100'));
  assert.ok(directions.includes('OUT:20'));
  assert.ok(directions.includes('ADJ:-3'));
  assert.equal(moves.filter((move: { reference: string }) => move.reference === receipt.reference).length, 1);

  const vendorMoves = await api('GET', '/api/move-history?search=vendor');
  assert.ok(vendorMoves.some((move: { reference: string }) => move.reference === receipt.reference));

  const dashboard = await api('GET', '/api/dashboard/stats');
  assert.equal(typeof dashboard.totalUnits, 'number');
  assert.ok(Array.isArray(dashboard.documents));
});
