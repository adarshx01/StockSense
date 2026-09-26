import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { ErrorState, TableSkeleton } from '../components/EmptyState';
import { Input } from '../components/Input';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useQuery } from '../hooks/useQuery';
import { formatRole } from '../lib/format';
import { ApiError } from '../services/api';
import { profileApi } from '../services/resources';

export function ProfilePage() {
  const { logout, setUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useQuery(() => profileApi.get(), []);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile.data) setName(profile.data.fullName);
  }, [profile.data]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const updated = await profileApi.update(name.trim());
      setUser(updated);
      toast.success('Profile updated');
      profile.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the profile');
    } finally {
      setBusy(false);
    }
  }

  if (profile.loading) return <TableSkeleton />;
  if (profile.error || !profile.data) return <ErrorState message={profile.error || 'Profile unavailable'} onRetry={profile.reload} />;

  return (
    <section className="page">
      <h1>My Profile</h1>
      <form className="panel stack" onSubmit={onSubmit}>
        <Input label="Login Id" value={profile.data.loginId} readOnly />
        <Input label="Email" value={profile.data.email} readOnly />
        <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <Input label="Role" value={formatRole(profile.data.role)} readOnly />
        <div className="actions">
          <Button type="submit" variant="primary" loading={busy}>Save name</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            Logout
          </Button>
        </div>
      </form>
    </section>
  );
}
