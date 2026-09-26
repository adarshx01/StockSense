export type ToastTone = 'info' | 'success' | 'danger' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

export function ToastViewport({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`toast toast-${item.tone}`} role="status">
          <span>{item.message}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => onDismiss(item.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
