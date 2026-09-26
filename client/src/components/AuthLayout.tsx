import type { ReactNode } from 'react';

export function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark" aria-hidden="true">S</span>
      StockSense
    </div>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <section className="auth-brand">
        <Logo />
        <div className="stack">
          <h1>Know what is in stock, and where it moves.</h1>
          <p className="muted">Receipts, deliveries, transfers, and counts in one operational view.</p>
        </div>
        <p className="muted">Inventory for the warehouse floor.</p>
      </section>
      <section className="auth-form">{children}</section>
    </div>
  );
}
