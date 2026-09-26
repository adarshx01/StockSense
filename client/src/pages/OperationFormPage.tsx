import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { ErrorState, TableSkeleton } from '../components/EmptyState';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { ProductLineTable, type EditableLine } from '../components/ProductLineTable';
import { Select } from '../components/Select';
import { StatusBreadcrumb } from '../components/StatusBreadcrumb';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useQuery } from '../hooks/useQuery';
import { displayUser, formatQty, STATUS_LABEL } from '../lib/format';
import { ApiError } from '../services/api';
import { docsApi, masterApi } from '../services/resources';
import type { DocKind, DocStatus, Location, Product } from '../types';

const PATH: Record<DocKind, string> = {
  receipt: '/receipts',
  delivery: '/deliveries',
  transfer: '/transfers',
  adjustment: '/adjustments',
};

const TITLE: Record<DocKind, string> = {
  receipt: 'Receipt',
  delivery: 'Delivery',
  transfer: 'Internal Transfer',
  adjustment: 'Inventory Adjustment',
};

interface FormState {
  receiveFrom: string;
  destinationLocationId: string;
  sourceLocationId: string;
  fromLocationId: string;
  toLocationId: string;
  deliveryAddress: string;
  operationType: string;
  contact: string;
  scheduleDate: string;
  lines: EditableLine[];
  productId: string;
  locationId: string;
  countedQty: string;
  reason: string;
  recordedQty: number | null;
  delta: number | null;
  reference: string;
  status: DocStatus;
  responsibleName: string;
}

function blank(responsible: string): FormState {
  return {
    receiveFrom: '',
    destinationLocationId: '',
    sourceLocationId: '',
    fromLocationId: '',
    toLocationId: '',
    deliveryAddress: '',
    operationType: 'Delivery',
    contact: '',
    scheduleDate: '',
    lines: [{ key: 'line-1', productId: '', quantity: '1' }],
    productId: '',
    locationId: '',
    countedQty: '',
    reason: '',
    recordedQty: null,
    delta: null,
    reference: '',
    status: 'draft',
    responsibleName: responsible,
  };
}

function lineKey(index: number): string {
  return `line-${index}-${Math.random().toString(16).slice(2, 6)}`;
}

export function OperationFormPage({ kind }: { kind: DocKind }) {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const responsible = displayUser(user?.fullName ?? '', user?.loginId ?? '');
  const [form, setForm] = useState<FormState>(() => blank(responsible));
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [previewQty, setPreviewQty] = useState<number | null>(null);

  const masters = useQuery(async () => {
    const [products, locations] = await Promise.all([masterApi.products(), masterApi.locations()]);
    return { products, locations };
  }, []);

  const doc = useQuery(async () => {
    if (!id) return null;
    return docsApi.get(kind, id);
  }, [kind, id]);

  useEffect(() => {
    if (!doc.data) return;
    const current = doc.data;
    setForm({
      ...blank(current.responsibleName || responsible),
      receiveFrom: current.receiveFrom,
      destinationLocationId: current.destinationLocationId,
      sourceLocationId: current.sourceLocationId,
      fromLocationId: current.fromLocationId,
      toLocationId: current.toLocationId,
      deliveryAddress: current.deliveryAddress,
      operationType: current.operationType || 'Delivery',
      contact: current.contact,
      scheduleDate: current.scheduleDate,
      lines: current.lines.length
        ? current.lines.map((line, index) => ({
            key: line.id || lineKey(index),
            productId: line.productId,
            quantity: String(line.quantity),
            outOfStock: line.outOfStock,
            productName: line.productName,
          }))
        : [{ key: 'line-1', productId: '', quantity: '1' }],
      productId: current.productId,
      locationId: current.locationId,
      countedQty: current.countedQty === null ? '' : String(current.countedQty),
      reason: current.reason,
      recordedQty: current.recordedQty,
      delta: current.delta,
      reference: current.reference,
      status: current.status,
      responsibleName: current.responsibleName || responsible,
    });
  }, [doc.data, responsible]);

  useEffect(() => {
    const short = (doc.data?.lines ?? []).filter((line) => line.outOfStock);
    if (short.length === 0) return;
    const names = short.map((line) => line.productName || 'A product').join(', ');
    toast.warning(`${names} is not in stock`);
  }, [doc.data, toast]);

  useEffect(() => {
    if (kind !== 'adjustment' || !isNew || !form.productId || !form.locationId) return;
    let cancelled = false;
    masterApi.product(form.productId).then((product) => {
      if (cancelled) return;
      const match = product.stockByLocation.find((row) => row.locationId === form.locationId);
      setPreviewQty(match?.onHand ?? 0);
    }).catch(() => {
      if (!cancelled) setPreviewQty(0);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, isNew, form.productId, form.locationId]);

  const products = masters.data?.products ?? [];
  const locations = masters.data?.locations ?? [];
  const locked = form.status === 'done' || form.status === 'canceled';
  const editable = !locked && (isNew || kind === 'receipt' || kind === 'delivery');
  const recorded = isNew ? previewQty : form.recordedQty;
  const counted = Number(form.countedQty);
  const deltaPreview = recorded !== null && form.countedQty !== '' && Number.isFinite(counted) ? counted - recorded : form.delta;

  const shortLines = form.lines.filter((line) => line.outOfStock);

  function patch(partial: Partial<FormState>) {
    setForm((current) => ({ ...current, ...partial }));
  }

  function warehouseFor(locationId: string): string {
    return locations.find((location) => location.id === locationId)?.warehouseId ?? '';
  }

  function cleanLines() {
    return form.lines
      .filter((line) => line.productId && Number(line.quantity) > 0)
      .map((line) => ({ productId: line.productId, quantity: Number(line.quantity) }));
  }

  function validateForm(): string | null {
    if (kind === 'adjustment') {
      if (!form.productId || !form.locationId || form.countedQty === '') return 'Product, location, and counted quantity are required';
      return null;
    }
    const lines = cleanLines();
    if (lines.length === 0) return 'Add at least one product line with a quantity';
    if (kind === 'receipt' && !form.destinationLocationId) return 'Destination location is required';
    if (kind === 'delivery' && !form.sourceLocationId) return 'Source location is required';
    if (kind === 'transfer' && (!form.fromLocationId || !form.toLocationId)) return 'From and to locations are required';
    if (kind === 'transfer' && form.fromLocationId === form.toLocationId) return 'Choose two different locations';
    return null;
  }

  function payload(): Record<string, unknown> {
    if (kind === 'receipt') {
      const locationId = form.destinationLocationId;
      return {
        warehouseId: warehouseFor(locationId),
        receiveFrom: form.receiveFrom,
        destinationLocationId: locationId,
        contact: form.contact,
        scheduleDate: form.scheduleDate || null,
        lines: cleanLines(),
      };
    }
    if (kind === 'delivery') {
      return {
        warehouseId: warehouseFor(form.sourceLocationId),
        sourceLocationId: form.sourceLocationId,
        deliveryAddress: form.deliveryAddress,
        contact: form.contact,
        scheduleDate: form.scheduleDate || null,
        operationType: form.operationType,
        lines: cleanLines(),
      };
    }
    if (kind === 'transfer') {
      return {
        warehouseId: warehouseFor(form.fromLocationId),
        fromLocationId: form.fromLocationId,
        toLocationId: form.toLocationId,
        contact: form.contact,
        scheduleDate: form.scheduleDate || null,
        lines: cleanLines(),
      };
    }
    return {
      productId: form.productId,
      locationId: form.locationId,
      countedQty: Number(form.countedQty),
      reason: form.reason,
    };
  }

  async function persist(): Promise<string> {
    if (isNew) {
      const created = await docsApi.create(kind, payload());
      return created.id;
    }
    if (kind === 'receipt' || kind === 'delivery') {
      await docsApi.update(kind, id, payload());
    }
    return id;
  }

  async function run(action: 'save' | 'confirm' | 'validate' | 'apply' | 'cancel') {
    const problem = action === 'cancel' ? null : validateForm();
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    let createdId = '';
    try {
      const docId = action === 'cancel' && id ? id : await persist();
      if (isNew) createdId = docId;
      if (action !== 'save') {
        const updated = await docsApi.action(kind, docId, action === 'validate' ? 'validate' : action);
        const missing = updated.lines.filter((line) => line.outOfStock);
        if (missing.length > 0 || updated.status === 'waiting') {
          const names = missing.map((line) => line.productName || 'A product').join(', ');
          toast.warning(names ? `${names} is not in stock` : 'The product is not in stock');
        } else {
          toast.success(`${TITLE[kind]} is ${STATUS_LABEL[updated.status] ?? 'updated'}`);
        }
      } else {
        toast.success('Draft saved');
      }
      if (isNew) navigate(`${PATH[kind]}/${docId}`, { replace: true });
      else doc.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'The request failed');
      if (createdId) navigate(`${PATH[kind]}/${createdId}`, { replace: true });
    } finally {
      setBusy(false);
      setCancelOpen(false);
    }
  }

  const locationOptions = useMemo(() => locations, [locations]);

  if (!isNew && doc.loading) return <TableSkeleton />;
  if (!isNew && doc.error) return <ErrorState message={doc.error} onRetry={doc.reload} />;

  return (
    <section className="page">
      <div className="spread no-print">
        <div className="stack">
          <Link to={PATH[kind]}>Back to {TITLE[kind].toLowerCase()} list</Link>
          <h1>{isNew ? `New ${TITLE[kind]}` : form.reference || TITLE[kind]}</h1>
          <StatusBreadcrumb kind={kind} status={form.status} />
        </div>
        <div className="actions">
          {form.status === 'draft' && kind !== 'adjustment' ? (
            <Button type="button" variant="primary" loading={busy} onClick={() => run('confirm')}>Mark Ready</Button>
          ) : null}
          {form.status === 'ready' ? (
            <Button type="button" variant="primary" loading={busy} onClick={() => run('validate')}>Validate</Button>
          ) : null}
          {kind === 'adjustment' && form.status === 'draft' ? (
            <Button type="button" variant="primary" loading={busy} onClick={() => run('apply')}>Validate</Button>
          ) : null}
          {form.status === 'draft' && (isNew || kind === 'receipt' || kind === 'delivery') ? (
            <Button type="button" variant="ghost" loading={busy} onClick={() => run('save')}>Save draft</Button>
          ) : null}
          <Button type="button" variant="ghost" disabled={form.status !== 'done'} onClick={() => window.print()}>
            Print
          </Button>
          {!isNew && form.status !== 'done' && form.status !== 'canceled' && !(kind === 'adjustment' && form.status !== 'draft') ? (
            <Button type="button" variant="danger" onClick={() => setCancelOpen(true)}>Cancel</Button>
          ) : null}
        </div>
      </div>

      {kind === 'transfer' ? (
        <p className="note note-info">This moves quantity from one location to another. The company total does not change.</p>
      ) : null}
      {shortLines.length > 0 ? (
        <p className="note note-danger" role="alert">The product is not in stock. The short line is marked in red until a receipt or adjustment frees quantity.</p>
      ) : null}
      {form.status === 'waiting' ? (
        <p className="note">Waiting for stock. Validate becomes available when every line can be fulfilled and the status is Ready.</p>
      ) : null}

      <article className="panel stack">
        <div className="grid-2 no-print">
          <Input label="Reference" value={form.reference || 'Assigned when you save'} readOnly />
          {kind === 'receipt' ? (
            <Input label="Receive From" value={form.receiveFrom} disabled={!editable} onChange={(event) => patch({ receiveFrom: event.target.value })} />
          ) : null}
          {kind === 'delivery' ? (
            <Input label="Delivery Address" value={form.deliveryAddress} disabled={!editable} onChange={(event) => patch({ deliveryAddress: event.target.value })} />
          ) : null}
          {kind !== 'adjustment' ? (
            <Input label="Schedule Date" type="date" value={form.scheduleDate} disabled={!editable} onChange={(event) => patch({ scheduleDate: event.target.value })} />
          ) : null}
          <Input label="Responsible" value={form.responsibleName || responsible} readOnly />
          {kind === 'delivery' ? (
            <Input label="Operation type" value={form.operationType} disabled={!editable} onChange={(event) => patch({ operationType: event.target.value })} />
          ) : null}
          {kind === 'receipt' ? (
            <LocationSelect label="Destination location" locations={locationOptions} value={form.destinationLocationId} disabled={!editable} onChange={(value) => patch({ destinationLocationId: value })} />
          ) : null}
          {kind === 'delivery' ? (
            <LocationSelect label="Source location" locations={locationOptions} value={form.sourceLocationId} disabled={!editable} onChange={(value) => patch({ sourceLocationId: value })} />
          ) : null}
          {kind === 'transfer' ? (
            <>
              <LocationSelect label="From location" locations={locationOptions} value={form.fromLocationId} disabled={!editable} onChange={(value) => patch({ fromLocationId: value })} />
              <LocationSelect label="To location" locations={locationOptions} value={form.toLocationId} disabled={!editable} onChange={(value) => patch({ toLocationId: value })} />
            </>
          ) : null}
          {kind !== 'adjustment' ? (
            <Input label="Contact" value={form.contact} disabled={!editable} onChange={(event) => patch({ contact: event.target.value })} />
          ) : null}
          {kind === 'adjustment' ? (
            <>
              <Select label="Product" value={form.productId} disabled={!editable} onChange={(event) => patch({ productId: event.target.value })}>
                <option value="">Select a product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>
                ))}
              </Select>
              <LocationSelect label="Location" locations={locationOptions} value={form.locationId} disabled={!editable} onChange={(value) => patch({ locationId: value })} />
              <Input label="Recorded quantity" value={recorded === null ? 'Calculated when you choose a location' : formatQty(recorded)} readOnly hint="Captured from on-hand at this location." />
              <Input label="Counted quantity" type="number" min="0" step="any" value={form.countedQty} disabled={!editable} onChange={(event) => patch({ countedQty: event.target.value })} />
              <Input label="Delta" value={deltaPreview === null ? '—' : formatQty(deltaPreview)} readOnly hint="Counted minus recorded." />
              <label className="field">
                <span>Reason</span>
                <textarea className="control" value={form.reason} disabled={!editable} onChange={(event) => patch({ reason: event.target.value })} />
              </label>
            </>
          ) : null}
        </div>

        {kind !== 'adjustment' ? (
          <div className="no-print">
            <ProductLineTable
              lines={form.lines}
              products={products}
              disabled={!editable}
              onChange={(lines) => patch({ lines })}
            />
          </div>
        ) : null}

        <Printable kind={kind} form={form} products={products} locations={locations} recorded={recorded} delta={deltaPreview} />
      </article>

      <Modal
        open={cancelOpen}
        title={`Cancel this ${TITLE[kind].toLowerCase()}?`}
        onClose={() => setCancelOpen(false)}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setCancelOpen(false)}>Keep it</Button>
            <Button type="button" variant="danger" loading={busy} onClick={() => run('cancel')}>Cancel document</Button>
          </>
        }
      >
        <p>Cancel is allowed before the document is done. Stock does not move.</p>
      </Modal>
    </section>
  );
}

function LocationSelect({
  label,
  locations,
  value,
  disabled,
  onChange,
}: {
  label: string;
  locations: Location[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select a location</option>
      {locations.map((location) => (
        <option key={location.id} value={location.id}>
          {location.display} — {location.name}
        </option>
      ))}
    </Select>
  );
}

function Printable({
  kind,
  form,
  products,
  locations,
  recorded,
  delta,
}: {
  kind: DocKind;
  form: FormState;
  products: Product[];
  locations: Location[];
  recorded: number | null;
  delta: number | null;
}) {
  const place = (locationId: string) => locations.find((location) => location.id === locationId)?.display || '—';
  const productName = (productId: string, fallback?: string) =>
    fallback || products.find((product) => product.id === productId)?.name || productId || '—';

  return (
    <div className="print-only">
      <p>StockSense</p>
      <h1>{form.reference || TITLE[kind]}</h1>
      <p>Status: {STATUS_LABEL[form.status]}</p>
      <p>Responsible: {form.responsibleName || '—'}</p>
      {kind === 'receipt' ? <p>Receive from: {form.receiveFrom || '—'}</p> : null}
      {kind === 'delivery' ? <p>Delivery address: {form.deliveryAddress || '—'}</p> : null}
      {kind === 'delivery' ? <p>Operation type: {form.operationType || '—'}</p> : null}
      {kind !== 'adjustment' ? <p>Schedule date: {form.scheduleDate || '—'}</p> : null}
      {kind !== 'adjustment' ? <p>Contact: {form.contact || '—'}</p> : null}
      {kind === 'receipt' ? <p>Destination: {place(form.destinationLocationId)}</p> : null}
      {kind === 'delivery' ? <p>Source: {place(form.sourceLocationId)}</p> : null}
      {kind === 'transfer' ? (
        <p>From {place(form.fromLocationId)} to {place(form.toLocationId)}. Company total unchanged.</p>
      ) : null}
      {kind === 'adjustment' ? (
        <>
          <p>Product: {productName(form.productId)}</p>
          <p>Location: {place(form.locationId)}</p>
          <p>Recorded: {formatQty(recorded)} · Counted: {form.countedQty || '—'} · Delta: {formatQty(delta)}</p>
          <p>Reason: {form.reason || '—'}</p>
        </>
      ) : (
        <table>
          <thead>
            <tr><th>Product</th><th>Quantity</th></tr>
          </thead>
          <tbody>
            {form.lines.filter((line) => line.productId).map((line) => (
              <tr key={line.key}>
                <td>{productName(line.productId, line.productName)}</td>
                <td>{line.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
