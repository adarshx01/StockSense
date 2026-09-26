import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const OPERATIONS = [
  { to: '/receipts', label: 'Receipts' },
  { to: '/deliveries', label: 'Delivery' },
  { to: '/transfers', label: 'Internal Transfer' },
  { to: '/adjustments', label: 'Inventory Adjustment' },
];

const SETTINGS = [
  { to: '/settings/warehouses', label: 'Warehouse' },
  { to: '/settings/locations', label: 'Locations' },
];

function Menu({ label, items }: { label: string; items: { to: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const active = items.some((item) => window.location.pathname.startsWith(item.to));

  return (
    <div className="menu" ref={ref}>
      <button type="button" aria-expanded={open} aria-haspopup="menu" className={active ? 'active' : undefined} onClick={() => setOpen((value) => !value)}>
        {label}
      </button>
      {open ? (
        <div className="menu-panel" role="menu">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} role="menuitem" onClick={() => setOpen(false)}>
              {item.label}
            </NavLink>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Navbar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);
  const initial = (user?.fullName || user?.loginId || 'A').trim().charAt(0).toUpperCase();

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!avatarRef.current?.contains(event.target as Node)) setAvatarOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <header className="navbar">
      <NavLink to="/" className="brand">StockSense</NavLink>
      <button type="button" className="btn btn-ghost btn-sm nav-toggle" aria-expanded={open} aria-label="Open menu" onClick={onToggle}>
        Menu
      </button>
      <nav className={open ? 'nav-links open' : 'nav-links'} aria-label="Primary">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Dashboard
        </NavLink>
        <Menu label="Operations" items={OPERATIONS} />
        <NavLink to="/products" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Products
        </NavLink>
        <NavLink to="/stock" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Stock
        </NavLink>
        <NavLink to="/move-history" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Move History
        </NavLink>
        <Menu label="Settings" items={SETTINGS} />
      </nav>
      <div className="menu" ref={avatarRef}>
        <button type="button" className="avatar" aria-label="Account menu" aria-expanded={avatarOpen} onClick={() => setAvatarOpen((value) => !value)}>
          {initial}
        </button>
        {avatarOpen ? (
          <div className="menu-panel right" role="menu">
            <button type="button" role="menuitem" onClick={() => { setAvatarOpen(false); navigate('/profile'); }}>
              My Profile
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Logout
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
