import { useId, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Input({ label, hint, error, id, ...props }: InputProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <input id={fieldId} className="control" aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${fieldId}-help` : undefined} {...props} />
      {error ? (
        <p id={`${fieldId}-help`} className="field-error" role="alert">{error}</p>
      ) : hint ? (
        <p id={`${fieldId}-help`} className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}
