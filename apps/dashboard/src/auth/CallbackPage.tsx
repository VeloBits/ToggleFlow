import { AlertTriangleIcon } from '@velobits-dev/icons';
import { Alert, AlertDescription, AlertTitle, Button, Spinner } from '@velobits-dev/ui';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { userManager } from './oidc';
import { returnToFromState } from './return-to';

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
      .then((loaded) => navigate(returnToFromState(loaded.state), { replace: true }))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [navigate]);

  if (error) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-4 px-6">
        <Alert variant="danger" className="max-w-md">
          <AlertTriangleIcon />
          <AlertTitle>Sign-in failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        {/*
         * A full page load, not a router navigation: the OIDC client is in a
         * failed state and the point of this link is to start over cleanly.
         */}
        <Button asChild variant="secondary">
          <Link to="/" reloadDocument>
            Back
          </Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-3">
      <Spinner size={20} label={null} className="text-muted-foreground" />
      <p className="text-muted-foreground m-0 text-[13px]" role="status">
        Signing you in…
      </p>
    </main>
  );
}
