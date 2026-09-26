-- StockSense schema.
-- Adjustment ledger rows store a signed quantity (counted - recorded).
-- IN, OUT, and INT rows store a positive quantity moved.

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    login_id VARCHAR(12) NOT NULL UNIQUE CHECK (char_length(login_id) BETWEEN 6 AND 12),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(32) NOT NULL DEFAULT 'warehouse_staff' CHECK (role IN ('inventory_manager', 'warehouse_staff')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE otp_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    otp_code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    short_code VARCHAR(10) NOT NULL UNIQUE,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    short_code VARCHAR(50) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (warehouse_id, short_code)
);

CREATE UNIQUE INDEX locations_one_default_per_warehouse
    ON locations (warehouse_id) WHERE is_default;

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(50) NOT NULL UNIQUE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    uom VARCHAR(50) NOT NULL DEFAULT 'Units',
    per_unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (per_unit_cost >= 0),
    reorder_level INTEGER NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    on_hand NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, location_id)
);

CREATE TABLE reference_counters (
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    operation_type VARCHAR(3) NOT NULL CHECK (operation_type IN ('IN', 'OUT', 'INT', 'ADJ')),
    last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
    PRIMARY KEY (warehouse_id, operation_type)
);

CREATE TABLE receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(50) NOT NULL UNIQUE,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    destination_location_id UUID NOT NULL REFERENCES locations(id),
    contact VARCHAR(255),
    schedule_date DATE,
    responsible_id UUID REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'done', 'canceled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE receipt_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity NUMERIC(14, 2) NOT NULL CHECK (quantity > 0)
);

CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(50) NOT NULL UNIQUE,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    source_location_id UUID NOT NULL REFERENCES locations(id),
    delivery_address TEXT,
    contact VARCHAR(255),
    schedule_date DATE,
    responsible_id UUID REFERENCES users(id),
    operation_type VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'waiting', 'ready', 'done', 'canceled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE delivery_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity NUMERIC(14, 2) NOT NULL CHECK (quantity > 0),
    out_of_stock BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE internal_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(50) NOT NULL UNIQUE,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    from_location_id UUID NOT NULL REFERENCES locations(id),
    to_location_id UUID NOT NULL REFERENCES locations(id),
    contact VARCHAR(255),
    schedule_date DATE,
    responsible_id UUID REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'waiting', 'ready', 'done', 'canceled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (from_location_id <> to_location_id)
);

CREATE TABLE transfer_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES internal_transfers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity NUMERIC(14, 2) NOT NULL CHECK (quantity > 0),
    out_of_stock BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(50) NOT NULL UNIQUE,
    product_id UUID NOT NULL REFERENCES products(id),
    location_id UUID NOT NULL REFERENCES locations(id),
    recorded_qty NUMERIC(14, 2) NOT NULL,
    counted_qty NUMERIC(14, 2) NOT NULL CHECK (counted_qty >= 0),
    delta NUMERIC(14, 2) NOT NULL,
    reason TEXT,
    contact VARCHAR(255),
    responsible_id UUID REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'done', 'canceled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_moves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(50) NOT NULL,
    move_type VARCHAR(20) NOT NULL CHECK (move_type IN ('receipt', 'delivery', 'transfer', 'adjustment')),
    product_id UUID NOT NULL REFERENCES products(id),
    from_location_id UUID REFERENCES locations(id),
    to_location_id UUID REFERENCES locations(id),
    from_label TEXT,
    to_label TEXT,
    quantity NUMERIC(14, 2) NOT NULL,
    contact VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'done',
    direction VARCHAR(3) NOT NULL CHECK (direction IN ('IN', 'OUT', 'INT', 'ADJ')),
    source_document_id UUID NOT NULL,
    source_document_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_levels_product ON stock_levels (product_id);
CREATE INDEX idx_stock_levels_location ON stock_levels (location_id);
CREATE INDEX idx_stock_moves_reference ON stock_moves (reference);
CREATE INDEX idx_stock_moves_product ON stock_moves (product_id);
CREATE INDEX idx_stock_moves_created ON stock_moves (created_at DESC);
CREATE INDEX idx_receipts_status ON receipts (status);
CREATE INDEX idx_deliveries_status_source ON deliveries (status, source_location_id);
CREATE INDEX idx_transfers_status_from ON internal_transfers (status, from_location_id);
CREATE INDEX idx_otp_user ON otp_tokens (user_id);
