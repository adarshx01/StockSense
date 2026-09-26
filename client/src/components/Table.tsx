import type { KeyboardEvent, ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  caption?: string;
}

export function Table<T>({ columns, rows, getRowKey, onRowClick, rowClassName, caption }: TableProps<T>) {
  function onKey(event: KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (!onRowClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick(row);
    }
  }

  return (
    <div className="table-wrap">
      <table>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              className={[onRowClick ? 'clickable' : '', rowClassName?.(row) ?? ''].filter(Boolean).join(' ')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={(event) => onKey(event, row)}
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
