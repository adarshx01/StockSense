import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout, Logo } from '../components/AuthLayout';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../services/api';

export function LoginPage() {
  const { token, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (token) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(loginId.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid Login Id or Password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={onSubmit}>
        <Logo />
        <h2>Sign in</h2>
        <Input label="Login Id" name="loginId" autoComplete="username" value={loginId} onChange={(event) => setLoginId(event.target.value)} required />
        <Input label="Password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <Button type="submit" variant="primary" className="btn-block" loading={loading}>SIGN IN</Button>
        <div className="auth-links">
          <Link to="/forgot-password">Forget Password?</Link>
          <Link to="/signup">Sign Up</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
