import bcrypt from 'bcryptjs';
import pg from 'pg';
import { createPool } from './pool.ts';
import { createAndApplyAdjustment, confirmDelivery, confirmReceipt } from '../services/inventoryService.ts';
import { generateReference } from '../services/referenceService.ts';

export async function runSeed(existing?: pg.Pool): Promise<void> {
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error('SEED_PASSWORD is required');
  const email = (process.env.SEED_EMAIL || 'manager@stocksense.local').toLowerCase();
  const pool = existing ?? createPool();
  const own = !existing;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(password, 10);
    await client.query(
      `INSERT INTO users (login_id, email, password_hash, full_name, role)
       VALUES ('manager', $1, $2, 'Manager', 'inventory_manager')
       ON CONFLICT (login_id) DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         role = 'inventory_manager',
         full_name = 'Manager',
         updated_at = NOW()`,
      [email, passwordHash],
    );
    const user = await client.query(`SELECT id FROM users WHERE login_id = 'manager'`);
    const userId = user.rows[0].id as string;

    const warehouse = await client.query(
      `INSERT INTO warehouses (name, short_code, address)
       VALUES ('Main Warehouse', 'WH', 'Warehouse')
       ON CONFLICT (short_code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );
    const warehouseId = warehouse.rows[0].id as string;

    const stock1 = await client.query(
      `INSERT INTO locations (warehouse_id, name, short_code, is_default)
       VALUES ($1, 'Stock1', 'Stock1', true)
       ON CONFLICT (warehouse_id, short_code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [warehouseId],
    );
    await client.query(
      `INSERT INTO locations (warehouse_id, name, short_code, is_default)
       VALUES ($1, 'Stock2', 'Stock2', false)
       ON CONFLICT (warehouse_id, short_code) DO UPDATE SET name = EXCLUDED.name`,
      [warehouseId],
    );
    const stock1Id = stock1.rows[0].id as string;

    const category = await client.query(
      `INSERT INTO categories (name) VALUES ('Furniture')
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );
    const categoryId = category.rows[0].id as string;

    const existingDesk = await client.query(`SELECT id FROM products WHERE sku = 'DESK001'`);
    if (!existingDesk.rows[0]) {
      const desk = await client.query(
        `INSERT INTO products (name, sku, category_id, uom, per_unit_cost, reorder_level)
         VALUES ('Desk', 'DESK001', $1, 'Units', 3000, 10) RETURNING id`,
        [categoryId],
      );
      const table = await client.query(
        `INSERT INTO products (name, sku, category_id, uom, per_unit_cost, reorder_level)
         VALUES ('Table', 'TABLE001', $1, 'Units', 3000, 10) RETURNING id`,
        [categoryId],
      );
      await createAndApplyAdjustment(client, {
        productId: desk.rows[0].id,
        locationId: stock1Id,
        countedQty: 50,
        reason: 'Initial stock',
        userId,
      });
      await createAndApplyAdjustment(client, {
        productId: table.rows[0].id,
        locationId: stock1Id,
        countedQty: 50,
        reason: 'Initial stock',
        userId,
      });

      const receiptRef = await generateReference(client, warehouseId, 'IN');
      const receipt = await client.query(
        `INSERT INTO receipts (reference, warehouse_id, destination_location_id, contact, schedule_date, responsible_id, status)
         VALUES ($1, $2, $3, 'vendor', CURRENT_DATE, $4, 'draft') RETURNING id`,
        [receiptRef, warehouseId, stock1Id, userId],
      );
      await client.query('INSERT INTO receipt_lines (receipt_id, product_id, quantity) VALUES ($1, $2, 10)', [
        receipt.rows[0].id,
        desk.rows[0].id,
      ]);
      await confirmReceipt(client, receipt.rows[0].id);

      const deliveryRef = await generateReference(client, warehouseId, 'OUT');
      const delivery = await client.query(
        `INSERT INTO deliveries (reference, warehouse_id, source_location_id, contact, schedule_date, responsible_id, status)
         VALUES ($1, $2, $3, 'Azure Interior', CURRENT_DATE, $4, 'draft') RETURNING id`,
        [deliveryRef, warehouseId, stock1Id, userId],
      );
      await client.query('INSERT INTO delivery_lines (delivery_id, product_id, quantity) VALUES ($1, $2, 5)', [
        delivery.rows[0].id,
        desk.rows[0].id,
      ]);
      await confirmDelivery(client, delivery.rows[0].id);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    if (own) await pool.end();
  }
}

const invoked = process.argv[1]?.includes('seed');
if (invoked) {
  runSeed()
    .then(() => {
      console.log('Seed completed');
    })
    .catch((err: unknown) => {
      console.error('Seed failed');
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
