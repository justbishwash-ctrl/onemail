import { useSearchParams, Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'You denied access to your Google account.',
  missing_params: 'Invalid OAuth callback. Please try again.',
  invalid_state: 'Security check failed. Please try signing in again.',
  token_exchange: 'Failed to exchange authorization code. Please try again.',
  no_refresh_token: 'Could not obtain a refresh token. Please try signing in again.',
  userinfo: 'Failed to retrieve your Google profile. Please try again.',
  email_not_verified: 'Your Google account email is not verified.',
  session_expired: 'Your session expired. Please sign in again.',
};

export default function AuthError() {
  const [params] = useSearchParams();
  const reason = params.get('reason') ?? 'unknown';
  const message = ERROR_MESSAGES[reason] ?? 'An unexpected error occurred during sign-in.';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-in text-center">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
        </div>
        <h1 className="text-xl font-semibold mb-2">Sign in failed</h1>
        <p className="text-sm text-muted-foreground mb-6">{message}</p>
        <Link
          to="/"
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Try again
        </Link>
      </div>
    </div>
  );
}
