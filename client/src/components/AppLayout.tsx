import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';

export function AppLayout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="app-shell">
      <a className="skip" href="#main">Skip to content</a>
      <Navbar open={open} onToggle={() => setOpen((value) => !value)} />
      <main id="main" className="content">
        <Outlet />
      </main>
    </div>
  );
}
