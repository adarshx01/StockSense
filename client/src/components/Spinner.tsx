export function Spinner({ label = 'Loading', large = false }: { label?: string; large?: boolean }) {
  return <span className={large ? 'spinner spinner-lg' : 'spinner'} role="status" aria-label={label} />;
}
