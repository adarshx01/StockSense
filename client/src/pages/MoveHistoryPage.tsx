import { useState } from 'react';
import { EmptyState, ErrorState, TableSkeleton } from '../components/EmptyState';
import { KanbanBoard } from '../components/KanbanBoard';
import { SearchBar } from '../components/SearchBar';
import { StatusPill } from '../components/StatusPill';
import { Table, type Column } from '../components/Table';
import { ViewToggle } from '../components/ViewToggle';
import { useDebounced } from '../hooks/useDebounced';
import { useQuery } from '../hooks/useQuery';
import { formatDate, formatQty, moveTone } from '../lib/format';
import { moveApi } from '../services/resources';
import type { DocStatus, MoveRow } from '../types';

const STATUSES: DocStatus[] = ['draft', 'waiting', 'ready', 'done', 'canceled'];

export function MoveHistoryPage() {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const debounced = useDebounced(search);
  const query = useQuery(() => moveApi.list(debounced), [debounced]);
  const rows = query.data ?? [];

  const columns: Column<MoveRow>[] = [
    { key: 'reference', header: 'Reference', render: (row) => row.reference || '—' },
    { key: 'product', header: 'Product', render: (row) => row.productName || '—' },
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    { key: 'contact', header: 'Contact', render: (row) => row.contact || '—' },
    { key: 'from', header: 'From', render: (row) => row.from || '—' },
    { key: 'to', header: 'To', render: (row) => row.to || '—' },
    { key: 'qty', header: 'Quantity', render: (row) => formatQty(row.quantity) },
    { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> },
  ];

  return (
    <section className="page">
      <div className="toolbar">
        <h1>Move History</h1>
        <SearchBar value={search} onChange={setSearch} placeholder="Search reference or contact" />
        <ViewToggle value={view} onChange={setView} />
      </div>
      <p className="legend">
        <span><i className="swatch in" /> Receipt in</span>
        <span><i className="swatch out" /> Delivery out</span>
        <span><i className="swatch int" /> Internal transfer</span>
        <span><i className="swatch adj" /> Adjustment</span>
      </p>
      <p className="muted">Each product line is its own row. Internal and adjustment rows are not colored as company in or out.</p>
      {query.loading ? <TableSkeleton /> : null}
      {query.error ? <ErrorState message={query.error} onRetry={query.reload} /> : null}
      {!query.loading && !query.error && rows.length === 0 ? (
        <EmptyState>No moves yet. Validate a receipt, delivery, transfer, or adjustment to write the ledger.</EmptyState>
      ) : null}
      {!query.loading && rows.length > 0 && view === 'list' ? (
        <Table
          caption="Move history"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          rowClassName={(row) => `row-${moveTone(row.reference, row.moveType)}`}
        />
      ) : null}
      {!query.loading && rows.length > 0 && view === 'kanban' ? (
        <KanbanBoard
          statuses={STATUSES.filter((status) => rows.some((row) => row.status === status))}
          items={rows}
          statusOf={(row) => row.status}
          onOpen={() => undefined}
          renderCard={(row) => (
            <span className="stack">
              <strong>{row.reference}</strong>
              <span>{row.productName}</span>
              <span className="muted">{formatQty(row.quantity)} · {row.from || '—'} → {row.to || '—'}</span>
            </span>
          )}
        />
      ) : null}
    </section>
  );
}
