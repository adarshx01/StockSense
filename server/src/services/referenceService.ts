import pg from 'pg';
import { AppError } from '../utils/errors.ts';

export async function generateReference(
  db: pg.PoolClient,
  warehouseId: string,
  operationType: 'IN' | 'OUT' | 'INT' | 'ADJ',
): Promise<string> {
  const counter = await db.query(
    `INSERT INTO reference_counters (warehouse_id, operation_type, last_number)
     VALUES ($1, $2, 1)
     ON CONFLICT (warehouse_id, operation_type)
     DO UPDATE SET last_number = reference_counters.last_number + 1
     RETURNING last_number`,
    [warehouseId, operationType],
  );
  const warehouse = await db.query('SELECT short_code FROM warehouses WHERE id = $1', [warehouseId]);
  if (!warehouse.rows[0]) throw new AppError('Warehouse not found', 404);
  const num = String(counter.rows[0].last_number).padStart(4, '0');
  return `${warehouse.rows[0].short_code}/${operationType}/${num}`;
}
