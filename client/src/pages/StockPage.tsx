import { useState } from 'react';
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
import { masterApi, stockApi } from '../services/resources';
import type { StockAtLocation, StockRow } from '../types';

export function StockPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const query = useQuery(() => stockApi.list(debounced), [debounced]);
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState<StockRow | null>(null);
  const [locations, setLocations] = useState<StockAtLocation[]>([]);
  const [allLocations, setAllLocations] = useState<{ id: string; display: string }[]>([]);
  const [locationId, setLocationId] = useState('');
  const [onHand, setOnHand] = useState('');
  const [busy, setBusy] = useState(false);

  async function openEditor(selected: StockRow) {
    setRow(selected);
    setOnHand(String(selected.onHand));
    setLocationId('');
    setOpen(true);
    try {
      const [product, locationList] = await Promise.all([masterApi.product(selected.id), masterApi.locations()]);
      setLocations(product.stockByLocation.length ? product.stockByLocation : selected.locations);
      setAllLocations(locationList.map((location) => ({ id: location.id, display: location.display })));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load locations');
      setLocations(selected.locations);
    }
  }

  function chooseLocation(next: string) {
    setLocationId(next);
    const found = locations.find((location) => location.locationId === next);
    if (found) setOnHand(String(found.onHand));
  }

  async function save() {
    if (!row || !locationId || onHand === '') {
      toast.error('Choose a location and a quantity');
      return;
    }
    setBusy(true);
    try {
      await stockApi.update(row.id, locationId, Number(onHand));
      toast.success('On-hand updated by posting an inventory adjustment');
      setOpen(false);
      query.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update stock');
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<StockRow>[] = [
    { key: 'product', header: 'Product', render: (item) => item.name },
    { key: 'sku', header: 'SKU', render: (item) => item.sku || '—' },
    { key: 'cost', header: 'Per unit cost', render: (item) => formatRs(item.perUnitCost) },
    { key: 'onHand', header: 'On hand', render: (item) => formatQty(item.onHand) },
    { key: 'free', header: 'Free to use', render: (item) => formatQty(item.freeToUse) },
  ];

  return (
    <section className="page">
      <div className="toolbar">
        <h1>Stock</h1>
        <SearchBar value={search} onChange={setSearch} placeholder="Search product or SKU" label="Search stock" />
      </div>
      <p className="muted">Changing on-hand does not edit the quantity directly. It posts an inventory adjustment so the change shows up in move history.</p>
      {query.loading ? <TableSkeleton /> : null}
      {query.error ? <ErrorState message={query.error} onRetry={query.reload} /> : null}
      {!query.loading && !query.error && (query.data ?? []).length === 0 ? (
        <EmptyState>No stock rows yet. Add a product, then receive it into a location.</EmptyState>
      ) : null}
      {!query.loading && (query.data ?? []).length > 0 ? (
        <Table caption="Stock" columns={columns} rows={query.data ?? []} getRowKey={(item) => item.id} onRowClick={(item) => void openEditor(item)} />
      ) : null}
      <Modal
        open={open}
        title={row ? `Update ${row.name}` : 'Update stock'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
            <Button type="button" variant="primary" loading={busy} onClick={() => void save()}>Post adjustment</Button>
          </>
        }
      >
        <div className="stack">
          <p>This posts an adjustment for the difference between the recorded on-hand and the quantity you enter.</p>
          <Select label="Location" value={locationId} onChange={(event) => chooseLocation(event.target.value)}>
            <option value="">Select a location</option>
            {allLocations.map((location) => (
              <option key={location.id} value={location.id}>{location.display}</option>
            ))}
          </Select>
          <Input label="On hand" type="number" min="0" step="any" value={onHand} onChange={(event) => setOnHand(event.target.value)} />
          {locations.length > 0 ? (
            <div>
              <p className="muted">Current breakdown</p>
              <ul>
                {locations.map((location) => (
                  <li key={location.locationId}>
                    {location.warehouseShortCode ? `${location.warehouseShortCode}/` : ''}{location.locationShortCode || location.locationName}: {formatQty(location.onHand)}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="muted">No location breakdown was returned for this product yet.</p>
          )}
        </div>
      </Modal>
    </section>
  );
}
