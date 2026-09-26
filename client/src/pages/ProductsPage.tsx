import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { EmptyState, ErrorState, TableSkeleton } from '../components/EmptyState';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { SearchBar } from '../components/SearchBar';
import { Select } from '../components/Select';
import { Table, type Column } from '../components/Table';
import { useToast } from '../context/ToastContext';
import { useDebounced } from '../hooks/useDebounced';
import { useQuery } from '../hooks/useQuery';
import { formatQty, formatRs } from '../lib/format';
import { ApiError } from '../services/api';
import { masterApi } from '../services/resources';
import type { Product } from '../types';

export function ProductsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const products = useQuery(() => masterApi.products(debounced), [debounced]);
  const categories = useQuery(() => masterApi.categories(), []);
  const [categoryName, setCategoryName] = useState('');
  const [rules, setRules] = useState<Record<string, string>>({});
  const [savingRule, setSavingRule] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const product of products.data ?? []) next[product.id] = String(product.reorderLevel);
    setRules(next);
  }, [products.data]);

  async function addCategory(event: FormEvent) {
    event.preventDefault();
    if (!categoryName.trim()) return;
    try {
      await masterApi.createCategory(categoryName.trim());
      setCategoryName('');
      toast.success('Category added');
      categories.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add the category');
    }
  }

  async function saveRule(product: Product) {
    setSavingRule(product.id);
    try {
      await masterApi.updateProduct(product.id, {
        name: product.name,
        sku: product.sku,
        categoryId: product.categoryId || null,
        unitOfMeasure: product.unitOfMeasure,
        perUnitCost: product.perUnitCost,
        reorderLevel: Number(rules[product.id] ?? 0),
      });
      toast.success(`Reorder level saved for ${product.name}`);
      products.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the reorder level');
    } finally {
      setSavingRule(null);
    }
  }

  const columns: Column<Product>[] = [
    { key: 'name', header: 'Name', render: (row) => row.name },
    { key: 'sku', header: 'SKU', render: (row) => row.sku },
    { key: 'category', header: 'Category', render: (row) => row.categoryName || '—' },
    { key: 'uom', header: 'Unit', render: (row) => row.unitOfMeasure },
    { key: 'cost', header: 'Per unit cost', render: (row) => formatRs(row.perUnitCost) },
    { key: 'reorder', header: 'Reorder level', render: (row) => formatQty(row.reorderLevel) },
    { key: 'stock', header: 'On hand', render: (row) => formatQty(row.totalStock) },
  ];

  return (
    <section className="page">
      <div className="toolbar">
        <Link to="/products/new" className="btn btn-primary">NEW</Link>
        <h1>Products</h1>
        <SearchBar value={search} onChange={setSearch} placeholder="Search name or SKU" label="Search products" />
      </div>
      {products.loading ? <TableSkeleton /> : null}
      {products.error ? <ErrorState message={products.error} onRetry={products.reload} /> : null}
      {!products.loading && !products.error && (products.data ?? []).length === 0 ? (
        <EmptyState>No products yet. Create one with a SKU so receipts can reference it.</EmptyState>
      ) : null}
      {!products.loading && (products.data ?? []).length > 0 ? (
        <Table caption="Products" columns={columns} rows={products.data ?? []} getRowKey={(row) => row.id} onRowClick={(row) => navigate(`/products/${row.id}`)} />
      ) : null}

      <section className="panel stack">
        <h2>Categories</h2>
        <form className="row" onSubmit={addCategory}>
          <Input label="Category name" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
          <Button type="submit" variant="primary">Add category</Button>
        </form>
        {categories.error ? <ErrorState message={categories.error} onRetry={categories.reload} /> : null}
        {(categories.data ?? []).length === 0 && !categories.loading ? (
          <p className="muted">No categories yet. Add one, then assign it on a product.</p>
        ) : (
          <ul>
            {(categories.data ?? []).map((category) => (
              <li key={category.id}>{category.name}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel stack">
        <h2>Reordering rules</h2>
        <p className="muted">Minimum quantity for a product. On-hand at or below this level counts as low stock.</p>
        {(products.data ?? []).length === 0 ? <p className="muted">Add a product before setting a minimum quantity.</p> : null}
        {(products.data ?? []).map((product) => (
          <div className="row" key={product.id}>
            <span style={{ flex: 1 }}>{product.name}</span>
            <label className="field">
              <span className="sr-only">Minimum quantity for {product.name}</span>
              <input
                className="control"
                type="number"
                min="0"
                aria-label={`Minimum quantity for ${product.name}`}
                value={rules[product.id] ?? ''}
                onChange={(event) => setRules((current) => ({ ...current, [product.id]: event.target.value }))}
              />
            </label>
            <Button type="button" size="sm" loading={savingRule === product.id} onClick={() => void saveRule(product)}>
              Save
            </Button>
          </div>
        ))}
      </section>
    </section>
  );
}

export function ProductFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const categories = useQuery(() => masterApi.categories(), []);
  const locations = useQuery(() => masterApi.locations(), []);
  const existing = useQuery(async () => (id ? masterApi.product(id) : null), [id]);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [unit, setUnit] = useState('Units');
  const [cost, setCost] = useState('0');
  const [reorder, setReorder] = useState('0');
  const [initialStock, setInitialStock] = useState('');
  const [locationId, setLocationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!existing.data) return;
    setName(existing.data.name);
    setSku(existing.data.sku);
    setCategoryId(existing.data.categoryId);
    setUnit(existing.data.unitOfMeasure || 'Units');
    setCost(String(existing.data.perUnitCost));
    setReorder(String(existing.data.reorderLevel));
  }, [existing.data]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        sku: sku.trim(),
        categoryId: categoryId || null,
        unitOfMeasure: unit,
        perUnitCost: Number(cost || 0),
        reorderLevel: Number(reorder || 0),
      };
      if (isNew) {
        if (initialStock) {
          payload.initialStock = Number(initialStock);
          payload.locationId = locationId;
        }
        const created = await masterApi.createProduct(payload);
        toast.success('Product created');
        navigate(`/products/${created.id}`, { replace: true });
      } else if (id) {
        await masterApi.updateProduct(id, payload);
        toast.success('Product updated');
        existing.reload();
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the product');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!id) return;
    setBusy(true);
    try {
      await masterApi.removeProduct(id);
      toast.success('Product deleted');
      navigate('/products');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete the product');
      setBusy(false);
    }
  }

  if (!isNew && existing.loading) return <TableSkeleton />;
  if (!isNew && existing.error) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  return (
    <section className="page">
      <Link to="/products">Back to products</Link>
      <h1>{isNew ? 'New product' : name || 'Product'}</h1>
      <form className="panel stack" onSubmit={onSubmit}>
        <div className="grid-2">
          <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
          <Input label="SKU" value={sku} onChange={(event) => setSku(event.target.value)} required />
          <Select label="Category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">No category</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </Select>
          <Input label="Unit of Measure" value={unit} onChange={(event) => setUnit(event.target.value)} />
          <Input label="Per unit cost" type="number" min="0" step="any" value={cost} onChange={(event) => setCost(event.target.value)} hint="Shown on Stock as rupees." />
          <Input label="Reorder level" type="number" min="0" step="1" value={reorder} onChange={(event) => setReorder(event.target.value)} hint="Minimum quantity before the product is low stock." />
          {isNew ? (
            <>
              <Input label="Initial stock" type="number" min="0" step="any" value={initialStock} onChange={(event) => setInitialStock(event.target.value)} hint="Optional quantity written into the location you pick." />
              <Select label="Initial stock location" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                <option value="">Select a location</option>
                {(locations.data ?? []).map((location) => (
                  <option key={location.id} value={location.id}>{location.display}</option>
                ))}
              </Select>
            </>
          ) : null}
        </div>
        <div className="actions">
          <Button type="submit" variant="primary" loading={busy}>Save</Button>
          {!isNew ? <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button> : null}
        </div>
      </form>
      {!isNew && existing.data ? (
        <section className="panel stack">
          <h2>Stock by location</h2>
          {existing.data.stockByLocation.length === 0 ? (
            <p className="muted">No quantity is stored for this product yet. Receive it or set an on-hand count from Stock.</p>
          ) : (
            <ul>
              {existing.data.stockByLocation.map((row) => (
                <li key={row.locationId}>
                  {row.warehouseShortCode ? `${row.warehouseShortCode}/` : ''}{row.locationShortCode || row.locationName}: {formatQty(row.onHand)}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      <Modal
        open={confirmDelete}
        title="Delete this product?"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Keep it</Button>
            <Button type="button" variant="danger" loading={busy} onClick={() => void remove()}>Delete</Button>
          </>
        }
      >
        <p>The product is removed. Documents that already reference it may fail to load their lines.</p>
      </Modal>
    </section>
  );
}
