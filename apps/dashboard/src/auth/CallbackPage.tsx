import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { userManager } from './oidc';

export function CallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // StrictMode double-mounts effects; the auth code is single-use.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    userManager
      .signinRedirectCallback()
      .then(() => navigate('/', { replace: true }))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [navigate]);

  if (error) {
    return (
      <main className="center-page">
        <p>Sign-in failed: {error}</p>
        <a href="/">Back</a>
      </main>
    );
  }
  return <main className="center-page">Signing you in…</main>;
}
