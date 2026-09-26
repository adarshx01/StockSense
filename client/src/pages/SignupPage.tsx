import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../context/AuthContext';
import { isEmail, passwordChecks } from '../lib/format';
import { ApiError } from '../services/api';

export function SignupPage() {
  const { token, signup } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const rules = passwordChecks(password, confirm);
  const loginOk = loginId.trim().length >= 6 && loginId.trim().length <= 12;
  const emailOk = isEmail(email.trim());
  const formOk = loginOk && emailOk && rules.every((rule) => rule.ok);

  if (token) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!formOk) return;
    setError('');
    setLoading(true);
    try {
      await signup({ loginId: loginId.trim(), email: email.trim(), password });
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={onSubmit}>
        <h2>Create an account</h2>
        <Input
          label="Login Id"
          name="loginId"
          autoComplete="username"
          value={loginId}
          onChange={(event) => setLoginId(event.target.value)}
          hint="6–12 characters. It must be unique."
          error={loginId.length > 0 && !loginOk ? 'Login ID must be 6–12 characters' : undefined}
          required
        />
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={email.length > 0 && !emailOk ? 'Enter a valid email' : undefined}
          required
        />
        <Input label="Password" name="password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        <Input label="Re-enter Password" name="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
        <ul className="rules" aria-label="Password rules">
          <li className={loginOk ? 'ok' : undefined}>Login ID is 6–12 characters</li>
          <li className={emailOk ? 'ok' : undefined}>Email is valid and must not already be registered</li>
          {rules.map((rule) => (
            <li key={rule.text} className={rule.ok ? 'ok' : undefined}>{rule.text}</li>
          ))}
        </ul>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <Button type="submit" variant="primary" className="btn-block" loading={loading} disabled={!formOk}>SIGN UP</Button>
        <Link to="/login">Already have an account? Sign in</Link>
      </form>
    </AuthLayout>
  );
}
