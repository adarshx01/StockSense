import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { passwordChecks } from '../lib/format';
import { ApiError } from '../services/api';
import { authApi } from '../services/resources';

export function ForgotPasswordPage() {
  const [step, setStep] = useState<'email' | 'reset' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const rules = passwordChecks(password, confirm);

  async function sendEmail(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authApi.forgotPassword(email.trim());
      setInfo(result.message || 'If the email exists, an OTP has been sent');
      setDevOtp(result.devOtp || '');
      if (result.devOtp) setOtp(result.devOtp);
      setStep('reset');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the reset email');
    } finally {
      setLoading(false);
    }
  }

  async function reset(event: FormEvent) {
    event.preventDefault();
    if (!rules.every((rule) => rule.ok) || otp.trim().length === 0) return;
    setError('');
    setLoading(true);
    try {
      await authApi.resetPassword(email.trim(), otp.trim(), password);
      setStep('done');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset the password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      {step === 'email' ? (
        <form className="auth-card" onSubmit={sendEmail}>
          <h2>Forget password</h2>
          <p className="muted">Enter the email on your account. We will send a one-time code.</p>
          <Input label="Email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          {error ? <p className="field-error" role="alert">{error}</p> : null}
          <Button type="submit" variant="primary" loading={loading}>Send OTP</Button>
          <Link to="/login">Back to sign in</Link>
        </form>
      ) : null}
      {step === 'reset' ? (
        <form className="auth-card" onSubmit={reset}>
          <h2>Enter the code</h2>
          {info ? <p className="muted">{info}</p> : null}
          {devOtp ? <p className="muted">Development code: <strong>{devOtp}</strong></p> : null}
          <Input label="Email" value={email} readOnly />
          <Input label="OTP" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value)} required />
          <Input label="New password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <Input label="Re-enter Password" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
          <ul className="rules">
            {rules.map((rule) => (
              <li key={rule.text} className={rule.ok ? 'ok' : undefined}>{rule.text}</li>
            ))}
          </ul>
          {error ? <p className="field-error" role="alert">{error}</p> : null}
          <Button type="submit" variant="primary" loading={loading} disabled={!rules.every((rule) => rule.ok)}>
            Set new password
          </Button>
        </form>
      ) : null}
      {step === 'done' ? (
        <div className="auth-card">
          <h2>Password updated</h2>
          <p className="muted">You can sign in with the new password.</p>
          <Link to="/login">Sign in</Link>
        </div>
      ) : null}
    </AuthLayout>
  );
}
