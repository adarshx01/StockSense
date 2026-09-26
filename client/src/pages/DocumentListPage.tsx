import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, TableSkeleton } from '../components/EmptyState';
import { KanbanBoard } from '../components/KanbanBoard';
import { SearchBar } from '../components/SearchBar';
import { StatusPill } from '../components/StatusPill';
import { Table, type Column } from '../components/Table';
import { ViewToggle } from '../components/ViewToggle';
import { useDebounced } from '../hooks/useDebounced';
import { useQuery } from '../hooks/useQuery';
import { formatDate, formatQty, STATUS_LABEL } from '../lib/format';
import { docsApi } from '../services/resources';
import type { DocKind, DocRow, DocStatus } from '../types';

const META: Record<DocKind, { title: string; path: string; empty: string; statuses: DocStatus[]; search: string }> = {
  receipt: {
    title: 'Receipts',
    path: '/receipts',
    empty: 'No receipts yet. Create one to receive stock into a location.',
    statuses: ['draft', 'ready', 'done', 'canceled'],
    search: 'Search reference or contact',
  },
  delivery: {
    title: 'Delivery',
    path: '/deliveries',
    empty: 'No deliveries yet. Create one when stock is ready to leave a location.',
    statuses: ['draft', 'waiting', 'ready', 'done', 'canceled'],
    search: 'Search reference or contact',
  },
  transfer: {
    title: 'Internal Transfer',
    path: '/transfers',
    empty: 'No internal transfers yet. Create one to move stock between locations. The company total stays the same.',
    statuses: ['draft', 'ready', 'done', 'canceled'],
    search: 'Search reference or contact',
  },
  adjustment: {
    title: 'Inventory Adjustment',
    path: '/adjustments',
    empty: 'No adjustments yet. Create one to correct a counted quantity at a location.',
    statuses: ['draft', 'done', 'canceled'],
    search: 'Search reference or product',
  },
};

function movementColumns(): Column<DocRow>[] {
  return [
    { key: 'reference', header: 'Reference', render: (row) => row.reference || '—' },
    { key: 'from', header: 'From', render: (row) => row.from || '—' },
    { key: 'to', header: 'To', render: (row) => row.to || '—' },
    { key: 'contact', header: 'Contact', render: (row) => row.contact || '—' },
    { key: 'schedule', header: 'Schedule date', render: (row) => formatDate(row.scheduleDate) },
    { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> },
  ];
}

function adjustmentColumns(): Column<DocRow>[] {
  return [
    { key: 'reference', header: 'Reference', render: (row) => row.reference || '—' },
    { key: 'product', header: 'Product', render: (row) => row.productName || '—' },
    { key: 'location', header: 'Location', render: (row) => row.locationName || '—' },
    { key: 'recorded', header: 'Recorded', render: (row) => formatQty(row.recordedQty) },
    { key: 'counted', header: 'Counted', render: (row) => formatQty(row.countedQty) },
    { key: 'delta', header: 'Delta', render: (row) => formatQty(row.delta) },
    { key: 'reason', header: 'Reason', render: (row) => row.reason || '—' },
    { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> },
  ];
}

export function DocumentListPage({ kind }: { kind: DocKind }) {
  const meta = META[kind];
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? '') as DocStatus | '';
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const debounced = useDebounced(search);
  const query = useQuery(() => docsApi.list(kind, debounced), [kind, debounced]);
  const rows = (query.data ?? []).filter((row) => !status || row.status === status);

  function setStatus(next: string) {
    const copy = new URLSearchParams(params);
    if (next) copy.set('status', next);
    else copy.delete('status');
    setParams(copy);
  }

  return (
    <section className="page">
      <div className="toolbar">
        <Link to={`${meta.path}/new`} className="btn btn-primary">NEW</Link>
        <h1>{meta.title}</h1>
        <SearchBar value={search} onChange={setSearch} placeholder={meta.search} />
        <ViewToggle value={view} onChange={setView} />
      </div>
      {kind === 'transfer' ? (
        <p className="muted">Stock moves from one location to another. The company total does not change.</p>
      ) : null}
      <label className="field" style={{ maxWidth: 240 }}>
        <span>Status</span>
        <select className="control" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {meta.statuses.map((item) => (
            <option key={item} value={item}>{STATUS_LABEL[item]}</option>
          ))}
        </select>
      </label>
      {query.loading ? <TableSkeleton /> : null}
      {query.error ? <ErrorState message={query.error} onRetry={query.reload} /> : null}
      {!query.loading && !query.error && rows.length === 0 ? <EmptyState>{meta.empty}</EmptyState> : null}
      {!query.loading && !query.error && rows.length > 0 && view === 'list' ? (
        <Table
          caption={meta.title}
          columns={kind === 'adjustment' ? adjustmentColumns() : movementColumns()}
          rows={rows}
          getRowKey={(row) => row.id}
          onRowClick={(row) => navigate(`${meta.path}/${row.id}`)}
        />
      ) : null}
      {!query.loading && !query.error && rows.length > 0 && view === 'kanban' ? (
        <KanbanBoard
          statuses={meta.statuses}
          items={rows}
          statusOf={(row) => row.status}
          onOpen={(row) => navigate(`${meta.path}/${row.id}`)}
          renderCard={(row) => (
            <span className="stack">
              <strong>{row.reference || 'Draft'}</strong>
              <span className="muted">{row.contact || row.productName || row.from || 'No contact'}</span>
            </span>
          )}
        />
      ) : null}
    </section>
  );
}
