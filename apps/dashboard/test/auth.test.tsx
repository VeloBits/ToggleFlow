// @vitest-environment happy-dom
/**
 * AuthProvider's lifecycle (initial load, expiry, UserManager events), the
 * token helper the API client depends on, and the two auth-facing screens.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { User } from 'oidc-client-ts';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, getAccessToken, useAuth } from '../src/auth/AuthContext';
import { CallbackPage } from '../src/auth/CallbackPage';
import { userManager } from '../src/auth/oidc';
import { stubAuth, testUser } from './harness';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Probe() {
  const { user, loading, login, signup, logout } = useAuth();
  return (
    <>
      <span data-testid="state">{loading ? 'loading' : (user?.profile.email ?? 'anonymous')}</span>
      <button type="button" onClick={() => void login()}>
        login
      </button>
      <button type="button" onClick={() => void signup()}>
        signup
      </button>
      <button type="button" onClick={() => void logout()}>
        logout
      </button>
    </>
  );
}

const renderProbe = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

describe('AuthProvider', () => {
  it('resolves a stored user and leaves loading', async () => {
    stubAuth();
    renderProbe();
    expect(screen.getByTestId('state').textContent).toBe('loading');
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('dev@velobits.test'));
  });

  it('treats an expired user as logged out', async () => {
    stubAuth({ user: { ...testUser, expired: true } as unknown as User });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('anonymous'));
  });

  it('treats no stored user as logged out', async () => {
    stubAuth({ user: null });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('anonymous'));
  });

  it('adopts a user pushed by the userLoaded event (silent renew)', async () => {
    stubAuth({ user: null });
    let onLoaded: ((u: User) => void) | undefined;
    vi.spyOn(userManager.events, 'addUserLoaded').mockImplementation((cb) => {
      onLoaded = cb as (u: User) => void;
      // oidc-client-ts hands back an unsubscribe function.
      return () => {};
    });

    renderProbe();
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('anonymous'));

    act(() => onLoaded!(testUser));
    expect(screen.getByTestId('state').textContent).toBe('dev@velobits.test');
  });

  it('clears the user on the userUnloaded event (logout in another tab)', async () => {
    stubAuth();
    let onUnloaded: (() => void) | undefined;
    vi.spyOn(userManager.events, 'addUserUnloaded').mockImplementation((cb) => {
      onUnloaded = cb as () => void;
      return () => {};
    });

    renderProbe();
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('dev@velobits.test'));

    act(() => onUnloaded!());
    expect(screen.getByTestId('state').textContent).toBe('anonymous');
  });

  it('detaches both event listeners on unmount', async () => {
    stubAuth();
    const removeLoaded = vi.spyOn(userManager.events, 'removeUserLoaded');
    const removeUnloaded = vi.spyOn(userManager.events, 'removeUserUnloaded');

    const { unmount } = renderProbe();
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('dev@velobits.test'));
    unmount();

    expect(removeLoaded).toHaveBeenCalled();
    expect(removeUnloaded).toHaveBeenCalled();
  });

  it('wires login, signup, and logout to the UserManager', async () => {
    const auth = stubAuth();
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('dev@velobits.test'));

    // No argument means "land back on /" once Keycloak returns.
    fireEvent.click(screen.getByText('login'));
    expect(auth.signinRedirect).toHaveBeenCalledWith({ state: { returnTo: '/' } });

    // signupRedirect drives a second UserManager (Keycloak's /registrations)
    // that this module never exports, so it is only observable as "did not
    // throw" here.
    expect(() => fireEvent.click(screen.getByText('signup'))).not.toThrow();

    fireEvent.click(screen.getByText('logout'));
    expect(auth.signoutRedirect).toHaveBeenCalled();
  });

  it('useAuth outside a provider fails loudly', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useAuth outside AuthProvider');
  });
});

describe('getAccessToken', () => {
  it('returns the access token when signed in', async () => {
    stubAuth();
    expect(await getAccessToken()).toBe('test-token');
  });

  it('returns an empty string when signed out, so requests still form', async () => {
    stubAuth({ user: null });
    expect(await getAccessToken()).toBe('');
  });
});

// The sign-in/sign-up entry points moved to GuestHomePage when the dedicated
// login screen was dropped; units.test.tsx covers them, including the returnTo
// deep link that the old LoginPage had no notion of.

describe('CallbackPage', () => {
  const renderCallback = () =>
    render(
      <MemoryRouter initialEntries={['/auth/callback']}>
        <CallbackPage />
      </MemoryRouter>,
    );

  it('completes the code exchange exactly once despite StrictMode double-mount', async () => {
    const auth = stubAuth();
    renderCallback();
    await waitFor(() => expect(auth.signinRedirectCallback).toHaveBeenCalled());
    expect(auth.signinRedirectCallback).toHaveBeenCalledOnce();
  });

  it('shows a progress message while exchanging', () => {
    stubAuth();
    renderCallback();
    expect(screen.getByText('Signing you in…')).toBeTruthy();
  });

  it('surfaces the failure reason when the exchange rejects', async () => {
    stubAuth();
    vi.spyOn(userManager, 'signinRedirectCallback').mockRejectedValue(new Error('state not found'));
    renderCallback();
    await waitFor(() => expect(screen.getByText(/state not found/)).toBeTruthy());
    expect(screen.getByText('Back')).toBeTruthy();
  });

  it('stringifies a non-Error rejection', async () => {
    stubAuth();
    vi.spyOn(userManager, 'signinRedirectCallback').mockRejectedValue('access_denied');
    renderCallback();
    await waitFor(() => expect(screen.getByText(/access_denied/)).toBeTruthy());
  });
});
