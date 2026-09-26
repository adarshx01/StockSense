import type { ReactNode } from 'react';
import { STATUS_LABEL } from '../lib/format';
import type { DocStatus } from '../types';

interface KanbanBoardProps<T extends { id: string }> {
  statuses: DocStatus[];
  items: T[];
  statusOf: (item: T) => DocStatus;
  renderCard: (item: T) => ReactNode;
  onOpen: (item: T) => void;
}

export function KanbanBoard<T extends { id: string }>({ statuses, items, statusOf, renderCard, onOpen }: KanbanBoardProps<T>) {
  return (
    <div className="kanban">
      {statuses.map((status) => {
        const column = items.filter((item) => statusOf(item) === status);
        return (
          <section key={status} className="kanban-col" aria-label={STATUS_LABEL[status]}>
            <h3>
              {STATUS_LABEL[status]}
              <span>{column.length}</span>
            </h3>
            {column.length === 0 ? <p className="muted">Nothing here.</p> : null}
            {column.map((item) => (
              <button key={item.id} type="button" className="kanban-card" onClick={() => onOpen(item)}>
                {renderCard(item)}
              </button>
            ))}
          </section>
        );
      })}
    </div>
  );
}
