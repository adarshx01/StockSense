import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState, ErrorState, TableSkeleton } from '../components/EmptyState';
import { Select } from '../components/Select';
import { StatusPill } from '../components/StatusPill';
import { Table, type Column } from '../components/Table';
import { useQuery } from '../hooks/useQuery';
import { formatDate, formatQty, kindLabel } from '../lib/format';
import { loadDashboard, masterApi } from '../services/resources';
import type { DocRow, DocStatus } from '../types';

const PATH = {
  receipt: '/receipts',
  delivery: '/deliveries',
  transfer: '/transfers',
  adjustment: '/adjustments',
} as const;

export function DashboardPage() {
  const navigate = useNavigate();
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const masters = useQuery(async () => {
    const [warehouses, locations, categories, products] = await Promise.all([
      masterApi.warehouses(),
      masterApi.locations(),
      masterApi.categories(),
      masterApi.products(),
    ]);
    return { warehouses, locations, categories, products };
  }, []);

  const dashboard = useQuery(
    () => loadDashboard({ type, status, warehouseId, locationId, categoryId }),
    [type, status, warehouseId, locationId, categoryId],
  );

  const productCategory = new Map((masters.data?.products ?? []).map((product) => [product.id, product.categoryId]));
  const documents = (dashboard.data?.documents ?? []).filter((row) => {
    if (status && row.status !== (status as DocStatus)) return false;
    if (warehouseId && row.warehouseId && row.warehouseId !== warehouseId) return false;
    if (locationId && row.locationIds.length > 0 && !row.locationIds.includes(locationId)) return false;
    if (categoryId && row.productId) return productCategory.get(row.productId) === categoryId;
    return true;
  });

  const stats = dashboard.data?.stats;
  const locations = (masters.data?.locations ?? []).filter((location) => !warehouseId || location.warehouseId === warehouseId);

  const columns: Column<DocRow>[] = [
    { key: 'type', header: 'Type', render: (row) => kindLabel(row.kind) },
    { key: 'reference', header: 'Reference', render: (row) => row.reference || '—' },
    { key: 'from', header: 'From', render: (row) => row.from || row.productName || '—' },
    { key: 'to', header: 'To', render: (row) => row.to || row.locationName || '—' },
    { key: 'contact', header: 'Contact', render: (row) => row.contact || row.productName || '—' },
    { key: 'schedule', header: 'Schedule date', render: (row) => formatDate(row.scheduleDate) },
    { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> },
  ];

  return (
    <section className="page">
      <h1>Dashboard</h1>
      {dashboard.loading ? <div className="cards"><div className="skeleton card-skeleton" /><div className="skeleton card-skeleton" /></div> : null}
      {dashboard.error ? <ErrorState message={dashboard.error} onRetry={dashboard.reload} /> : null}
      {stats ? (
        <>
          <div className="cards">
            <article className="op-card">
              <h2>Receipt</h2>
              <div className="stat-line"><span>Late</span><strong>{stats.receiptCard.late}</strong></div>
              <div className="stat-line"><span>Operations</span><strong>{stats.receiptCard.operations}</strong></div>
              <Link className="btn btn-primary" to="/receipts?status=ready">{stats.receiptCard.toReceive} to receive</Link>
            </article>
            <article className="op-card">
              <h2>Delivery</h2>
              <div className="stat-line"><span>Late</span><strong>{stats.deliveryCard.late}</strong></div>
              <div className="stat-line"><span>Waiting</span><strong>{stats.deliveryCard.waiting}</strong></div>
              <div className="stat-line"><span>Operations</span><strong>{stats.deliveryCard.operations}</strong></div>
              <Link className="btn btn-primary" to="/deliveries?status=ready">{stats.deliveryCard.toDeliver} to Deliver</Link>
            </article>
          </div>
          <div className="kpis">
            <article className="kpi"><span>Total units</span><strong>{formatQty(dashboard.data?.totalUnits ?? 0)}</strong></article>
            <article className="kpi"><span>Low stock</span><strong>{stats.lowStockCount}</strong></article>
            <article className="kpi"><span>Out of stock</span><strong>{stats.outOfStockCount}</strong></article>
            <article className="kpi"><span>Pending receipts</span><strong>{stats.pendingReceipts}</strong></article>
            <article className="kpi"><span>Pending deliveries</span><strong>{stats.pendingDeliveries}</strong></article>
            <article className="kpi"><span>Transfers scheduled</span><strong>{stats.internalTransfersScheduled}</strong></article>
          </div>
        </>
      ) : null}

      <div className="filters">
        <Select label="Document type" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">All documents</option>
          <option value="receipts">Receipts</option>
          <option value="delivery">Delivery</option>
          <option value="internal">Internal</option>
          <option value="adjustments">Adjustments</option>
        </Select>
        <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="waiting">Waiting</option>
          <option value="ready">Ready</option>
          <option value="done">Done</option>
          <option value="canceled">Canceled</option>
        </Select>
        <Select label="Warehouse" value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); setLocationId(''); }}>
          <option value="">All warehouses</option>
          {(masters.data?.warehouses ?? []).map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
          ))}
        </Select>
        <Select label="Location" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
          <option value="">All locations</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>{location.display}</option>
          ))}
        </Select>
        <Select label="Product category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">All categories</option>
          {(masters.data?.categories ?? []).map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </Select>
      </div>

      {dashboard.loading ? <TableSkeleton /> : null}
      {!dashboard.loading && !dashboard.error && documents.length === 0 ? (
        <EmptyState>No documents match these filters. Create a receipt or delivery to see it here.</EmptyState>
      ) : null}
      {!dashboard.loading && documents.length > 0 ? (
        <Table
          caption="Filtered documents"
          columns={columns}
          rows={documents}
          getRowKey={(row) => `${row.kind}-${row.id}`}
          onRowClick={(row) => navigate(`${PATH[row.kind]}/${row.id}`)}
        />
      ) : null}
    </section>
  );
}
