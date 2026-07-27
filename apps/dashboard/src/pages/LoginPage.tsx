import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { login, signup } = useAuth();
  return (
    <main className="center-page">
      <div className="login-card">
        <h1>ToggleFlow</h1>
        <p className="muted">
          Kill switches, gradual rollouts, and live configuration for every tool in your app.
        </p>
        <div className="actions">
          <button type="button" className="primary" onClick={() => void login()}>
            Sign in
          </button>
          <button type="button" onClick={() => void signup()}>
            Create account
          </button>
        </div>
      </div>
    </main>
  );
}
