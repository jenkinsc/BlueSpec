import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../lib/auth.tsx';

interface InviteDetails {
  email: string;
  organization: { id: string; name: string; callsign: string | null };
  invitedBy: { callsign: string; name: string | null };
  expiresAt: string;
}

export function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const inviteQuery = useQuery<InviteDetails>({
    queryKey: ['invite', token],
    queryFn: () => apiFetch<InviteDetails>(`/api/organizations/invites/${token}`),
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ message: string; organization: { id: string; name: string } }>(
        `/api/organizations/invites/${token}/accept`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      setAccepted(true);
    },
    onError: (err) => {
      setAcceptError(err instanceof Error ? err.message : 'Failed to accept invite');
    },
  });

  if (inviteQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading invite…</p>
      </div>
    );
  }

  if (inviteQuery.isError) {
    const msg = inviteQuery.error instanceof Error ? inviteQuery.error.message : 'Invalid invite';
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm bg-white rounded-xl shadow p-6 text-center">
          <p className="text-2xl mb-2">⚠️</p>
          <h1 className="text-base font-semibold text-gray-900 mb-2">Invite not found</h1>
          <p className="text-sm text-gray-500 mb-4">{msg}</p>
          <button
            onClick={() => navigate('/login')}
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            Go to login
          </button>
        </div>
      </div>
    );
  }

  const invite = inviteQuery.data!;

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm bg-white rounded-xl shadow p-6 text-center">
          <p className="text-3xl mb-3">✓</p>
          <h1 className="text-base font-semibold text-gray-900 mb-2">
            You've joined {invite.organization.name}!
          </h1>
          <p className="text-sm text-gray-500 mb-4">You're now a member of the organization.</p>
          <button
            onClick={() => navigate('/')}
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            Go to dashboard →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow p-6">
        <h1 className="text-lg font-semibold text-gray-900 mb-1">You're invited!</h1>
        <p className="text-sm text-gray-500 mb-5">
          <strong className="font-mono text-gray-700">{invite.invitedBy.callsign}</strong> has
          invited you to join <strong className="text-gray-900">{invite.organization.name}</strong>.
        </p>

        {invite.organization.callsign && (
          <p className="text-xs font-mono text-gray-500 mb-4">
            Group callsign: {invite.organization.callsign}
          </p>
        )}

        <p className="text-xs text-gray-400 mb-5">
          Invite for <span className="font-mono">{invite.email}</span> · Expires{' '}
          {new Date(invite.expiresAt).toLocaleString()}
        </p>

        {acceptError && <p className="text-sm text-red-600 mb-3">{acceptError}</p>}

        {isAuthenticated ? (
          <button
            onClick={() => acceptMutation.mutate()}
            disabled={acceptMutation.isPending}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {acceptMutation.isPending ? 'Joining…' : `Join ${invite.organization.name}`}
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 text-center mb-3">
              Sign in or create an account to accept this invite.
            </p>
            <button
              onClick={() => navigate(`/login?redirect=/invite/${token}`)}
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-indigo-700"
            >
              Sign in to accept
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
