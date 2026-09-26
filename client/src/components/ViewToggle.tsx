export function ViewToggle({ value, onChange }: { value: 'list' | 'kanban'; onChange: (value: 'list' | 'kanban') => void }) {
  return (
    <div className="view-toggle" role="group" aria-label="Layout">
      <button type="button" aria-pressed={value === 'list'} onClick={() => onChange('list')}>
        List
      </button>
      <button type="button" aria-pressed={value === 'kanban'} onClick={() => onChange('kanban')}>
        Kanban
      </button>
    </div>
  );
}
