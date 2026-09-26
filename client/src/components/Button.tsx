import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  const classes = ['btn', variant === 'primary' ? 'btn-primary' : '', variant === 'ghost' ? 'btn-ghost' : '', variant === 'danger' ? 'btn-danger' : '', size === 'sm' ? 'btn-sm' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={classes} disabled={disabled || loading} {...props}>
      {loading ? <Spinner label="Working" /> : null}
      {children}
    </button>
  );
}
