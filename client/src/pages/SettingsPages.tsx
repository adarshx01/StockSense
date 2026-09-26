import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { EmptyState, ErrorState, TableSkeleton } from '../components/EmptyState';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Table, type Column } from '../components/Table';
import { useToast } from '../context/ToastContext';
import { useQuery } from '../hooks/useQuery';
import { ApiError } from '../services/api';
import { masterApi } from '../services/resources';
import type { Location, Warehouse } from '../types';

export function WarehousesPage() {
  const navigate = useNavigate();
  const query = useQuery(() => masterApi.warehouses(), []);
  const columns: Column<Warehouse>[] = [
    { key: 'name', header: 'Name', render: (row) => row.name },
    { key: 'code', header: 'Short code', render: (row) => row.shortCode },
    { key: 'address', header: 'Address', render: (row) => row.address || '—' },
    { key: 'locations', header: 'Locations', render: (row) => String(row.locationCount) },
  ];
  return (
    <section className="page">
      <div className="toolbar">
        <Link to="/settings/warehouses/new" className="btn btn-primary">NEW</Link>
        <h1>Warehouse</h1>
      </div>
      {query.loading ? <TableSkeleton /> : null}
      {query.error ? <ErrorState message={query.error} onRetry={query.reload} /> : null}
      {!query.loading && !query.error && (query.data ?? []).length === 0 ? (
        <EmptyState>No warehouse yet. Create one with a short code such as WH. References like WH/IN/0001 use that code.</EmptyState>
      ) : null}
      {!query.loading && (query.data ?? []).length > 0 ? (
        <Table caption="Warehouses" columns={columns} rows={query.data ?? []} getRowKey={(row) => row.id} onRowClick={(row) => navigate(`/settings/warehouses/${row.id}`)} />
      ) : null}
    </section>
  );
}

export function WarehouseFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const existing = useQuery(async () => (id ? masterApi.warehouse(id) : null), [id]);
  const [name, setName] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!existing.data) return;
    setName(existing.data.name);
    setShortCode(existing.data.shortCode);
    setAddress(existing.data.address);
  }, [existing.data]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = { name: name.trim(), shortCode: shortCode.trim(), address };
      if (isNew) {
        const created = await masterApi.createWarehouse(payload);
        toast.success('Warehouse created');
        navigate(`/settings/warehouses/${created.id}`, { replace: true });
      } else if (id) {
        await masterApi.updateWarehouse(id, payload);
        toast.success('Warehouse updated');
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the warehouse');
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && existing.loading) return <TableSkeleton />;
  if (!isNew && existing.error) return <ErrorState message={existing.error} onRetry={existing.reload} />;

  return (
    <section className="page">
      <Link to="/settings/warehouses">Back to warehouses</Link>
      <h1>{isNew ? 'New warehouse' : name || 'Warehouse'}</h1>
      <form className="panel stack" onSubmit={onSubmit}>
        <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
        <Input label="Short Code" value={shortCode} onChange={(event) => setShortCode(event.target.value)} required hint="Used in references, for example WH." />
        <label className="field">
          <span>Address</span>
          <textarea className="control" value={address} onChange={(event) => setAddress(event.target.value)} />
        </label>
        <Button type="submit" variant="primary" loading={busy}>Save</Button>
      </form>
    </section>
  );
}

export function LocationsPage() {
  const navigate = useNavigate();
  const query = useQuery(() => masterApi.locations(), []);
  const columns: Column<Location>[] = [
    { key: 'name', header: 'Name', render: (row) => row.name },
    { key: 'code', header: 'Short code', render: (row) => row.display },
    { key: 'warehouse', header: 'Warehouse', render: (row) => row.warehouseName || '—' },
  ];
  return (
    <section className="page">
      <div className="toolbar">
        <Link to="/settings/locations/new" className="btn btn-primary">NEW</Link>
        <h1>Locations</h1>
      </div>
      <p className="note">This holds multiple locations of a warehouse: rooms, racks, and stock zones.</p>
      {query.loading ? <TableSkeleton /> : null}
      {query.error ? <ErrorState message={query.error} onRetry={query.reload} /> : null}
      {!query.loading && !query.error && (query.data ?? []).length === 0 ? (
        <EmptyState>No locations yet. Add a room or stock zone under a warehouse so receipts have a destination.</EmptyState>
      ) : null}
      {!query.loading && (query.data ?? []).length > 0 ? (
        <Table caption="Locations" columns={columns} rows={query.data ?? []} getRowKey={(row) => row.id} onRowClick={(row) => navigate(`/settings/locations/${row.id}`)} />
      ) : null}
    </section>
  );
}

export function LocationFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const warehouses = useQuery(() => masterApi.warehouses(), []);
  const locations = useQuery(() => masterApi.locations(), []);
  const current = (locations.data ?? []).find((location) => location.id === id);
  const [name, setName] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!current) return;
    setName(current.name);
    setShortCode(current.shortCode);
    setWarehouseId(current.warehouseId);
  }, [current]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (isNew) {
        const created = await masterApi.createLocation({ name: name.trim(), shortCode: shortCode.trim(), warehouseId });
        toast.success('Location created');
        navigate(`/settings/locations/${created.id}`, { replace: true });
      } else if (id) {
        await masterApi.updateLocation(id, { name: name.trim(), shortCode: shortCode.trim() });
        toast.success('Location updated');
        locations.reload();
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the location');
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && locations.loading) return <TableSkeleton />;
  if (!isNew && locations.error) return <ErrorState message={locations.error} onRetry={locations.reload} />;
  if (!isNew && !locations.loading && !current) return <ErrorState message="Location not found" />;

  return (
    <section className="page">
      <Link to="/settings/locations">Back to locations</Link>
      <h1>{isNew ? 'New location' : name || 'Location'}</h1>
      <p className="muted">This holds multiple locations of a warehouse: rooms, racks, and stock zones.</p>
      <form className="panel stack" onSubmit={onSubmit}>
        <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
        <Input label="Short Code" value={shortCode} onChange={(event) => setShortCode(event.target.value)} required />
        <Select label="Warehouse" value={warehouseId} disabled={!isNew} onChange={(event) => setWarehouseId(event.target.value)} required>
          <option value="">Select a warehouse</option>
          {(warehouses.data ?? []).map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.shortCode})</option>
          ))}
        </Select>
        <Button type="submit" variant="primary" loading={busy}>Save</Button>
      </form>
    </section>
  );
}
