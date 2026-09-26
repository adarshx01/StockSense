# StockSense

Inventory API for receipts, deliveries, internal transfers, and physical adjustments. Every posted quantity change writes one append-only `stock_moves` row per product line.

## Stock rules

- A receipt increases on-hand at its destination. Ledger direction `IN`, quantity positive. Reference `WH/IN/0001`.
- A delivery decreases on-hand at its source. Ledger direction `OUT`, quantity positive. Reference `WH/OUT/0001`.
- An internal transfer decreases the source and increases the destination by the same quantity. Company total stays the same. Ledger direction `INT`, quantity positive. Reference `WH/INT/0001`.
- An adjustment sets one location to the counted quantity. Ledger direction `ADJ`. **`stock_moves.quantity` is the signed delta (counted − recorded).** A loss of 3 is stored as `-3`. Reference `WH/ADJ/0001`.
- Free to use is on-hand minus quantities on delivery and internal-transfer lines in `waiting` or `ready`. Draft, done, and canceled lines do not reserve. Receipts do not reserve.
- Confirming a delivery or transfer sets `ready` when every line fits free stock. Otherwise the document becomes `waiting` and each short line is `outOfStock`.
- When stock increases, waiting deliveries and transfers at that location are promoted to `ready` if they now fit.
- Validate is one `UPDATE ... WHERE status = 'ready' RETURNING` inside a transaction that locks the stock rows. A second validate does not post again.
- Done documents cannot be canceled. Canceling a draft, waiting, or ready document does not change stock.
- `PUT /api/stock/:productId` with `{ locationId, onHand }` creates and applies an adjustment. It does not write the quantity by itself.
- Initial product stock is posted as an adjustment into the warehouse default internal location.
- Low stock means total on-hand is less than or equal to the product reorder level. Out of stock means total on-hand is 0.
- Roles: `inventory_manager` maintains warehouses, locations, categories, products, and reorder levels. `warehouse_staff` runs operations and stock updates and can read products. Signup creates `warehouse_staff`.

Status values are `draft`, `waiting`, `ready`, `done`, and `canceled`.

## Local run

```bash
docker compose up -d
cp server/.env.example server/.env
# set JWT_SECRET and SEED_PASSWORD in server/.env
npm install
npm run migrate
npm run seed
npm run dev
```

The API listens on port **3001**. CORS allows `http://localhost:5173` and any extra origins in `CORS_ORIGIN` (comma-separated).

Login id `manager`, email `SEED_EMAIL` (default `manager@stocksense.local`), password `SEED_PASSWORD`. The seed script reads those from the environment. The example file only has a placeholder.

Postgres for development is the Compose service `postgres:16`, published on host port **5433** (the machine already has a Postgres listener on 5432). Database `stocksense`, user `stocksense`, password `stocksense_local`.

## Tests

```bash
docker compose up -d
npm test
npm run typecheck
npm run build
```

`npm test` resets the `stocksense_test` database and runs the receive → transfer → deliver → adjust story, including a rejected second validate, a draft cancel, and a waiting delivery that becomes ready after a receipt.

## Password reset

`POST /api/auth/forgot-password` stores a 6-digit OTP and sends it with Amazon SES from `SES_FROM_EMAIL` in `ap-south-1`. If SES rejects the message, the OTP stays stored. In `NODE_ENV=development` the JSON includes `otp` only when that send failed, and the code is written to the server log. Passwords are not logged.

## Production

See `infra/DEPLOY.md` after the AWS stack is applied. The production database is a StockSense RDS instance in `ap-south-1`. Lambda reads `DATABASE_URL` and `JWT_SECRET` from Secrets Manager.
