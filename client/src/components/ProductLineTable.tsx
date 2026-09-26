import { Button } from './Button';
import { Select } from './Select';

export interface EditableLine {
  key: string;
  productId: string;
  quantity: string;
  outOfStock?: boolean;
  productName?: string;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
}

interface ProductLineTableProps {
  lines: EditableLine[];
  products: ProductOption[];
  onChange: (lines: EditableLine[]) => void;
  disabled?: boolean;
}

export function ProductLineTable({ lines, products, onChange, disabled }: ProductLineTableProps) {
  function update(key: string, patch: Partial<EditableLine>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLine() {
    onChange([...lines, { key: `new-${Date.now()}`, productId: '', quantity: '1' }]);
  }

  return (
    <div className="stack">
      <div className="spread">
        <h3>Products</h3>
        <Button type="button" size="sm" onClick={addLine} disabled={disabled}>
          Add product
        </Button>
      </div>
      {lines.length === 0 ? <p className="muted">Add a product line before you mark this ready.</p> : null}
      <div className="lines">
        {lines.map((line) => (
          <div key={line.key} className={line.outOfStock ? 'line line-short' : 'line'}>
            <Select
              label="Product"
              value={line.productId}
              disabled={disabled}
              onChange={(event) => update(line.key, { productId: event.target.value })}
            >
              <option value="">Select a product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.sku})
                </option>
              ))}
            </Select>
            <label className="field">
              <span>Quantity</span>
              <input
                className="control"
                type="number"
                min="0"
                step="any"
                value={line.quantity}
                disabled={disabled}
                aria-label="Quantity"
                onChange={(event) => update(line.key, { quantity: event.target.value })}
              />
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => onChange(lines.filter((item) => item.key !== line.key))}
            >
              Remove
            </Button>
            {line.outOfStock ? <p className="field-error">This product is not in stock.</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
