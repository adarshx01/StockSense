import { STATUS_LABEL } from '../lib/format';
import type { DocStatus } from '../types';

export function StatusPill({ status }: { status: DocStatus }) {
  return <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>;
}
