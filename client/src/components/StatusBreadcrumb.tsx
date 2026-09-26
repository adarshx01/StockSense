import { STATUS_LABEL } from '../lib/format';
import type { DocKind, DocStatus } from '../types';
import { StatusPill } from './StatusPill';

const STEPS: Record<DocKind, DocStatus[]> = {
  receipt: ['draft', 'ready', 'done'],
  delivery: ['draft', 'waiting', 'ready', 'done'],
  transfer: ['draft', 'ready', 'done'],
  adjustment: ['draft', 'done'],
};

export function StatusBreadcrumb({ kind, status }: { kind: DocKind; status: DocStatus }) {
  const steps = status === 'waiting' && !STEPS[kind].includes('waiting')
    ? (['draft', 'waiting', 'ready', 'done'] as DocStatus[])
    : STEPS[kind];

  return (
    <div className="crumbs" aria-label="Status">
      {steps.map((step, index) => (
        <span key={step}>
          {index > 0 ? <span className="sep"> &gt; </span> : null}
          <span className={step === status ? 'current' : undefined}>{STATUS_LABEL[step]}</span>
        </span>
      ))}
      {status === 'canceled' ? <StatusPill status="canceled" /> : null}
    </div>
  );
}
