import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.tsx';

// --- Types ---
interface OrgSummary {
  id: string;
  name: string;
  callsign: string | null;
  createdAt: string;
}

interface Member {
  id: string;
  operatorId: string;
  role: 'admin' | 'member';
  joinedAt: string;
  callsign: string | null;
  name: string | null;
}

interface OrgDetail extends OrgSummary {
  members: Member[];
}

// --- Helpers ---
function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

// --- Create org modal ---
function CreateOrgModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (org: OrgSummary) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [callsign, setCallsign] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<OrgSummary>('/api/organizations', {
        method: 'POST',
        body: JSON.stringify({ name, callsign: callsign || undefined }),
      }),
    onSuccess: (org) => {
      void queryClient.invalidateQueries({ queryKey: ['orgs'] });
      onCreated(org);
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create'),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">New Organization</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">
            ×
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="W9 ARES Group"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Group Callsign <span className="text-gray-400">(optional)</span>
            </label>
            <input
              value={callsign}
              onChange={(e) => setCallsign(e.target.value.toUpperCase())}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="W9ARES"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-md text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!name || mutation.isPending}
              className="flex-1 bg-indigo-600 text-white py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {mutation.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Invite form ---
function InviteForm({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'callsign' | 'email'>('callsign');
  const [callsign, setCallsign] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const callsignMutation = useMutation({
    mutationFn: () =>
      apiFetch<Member>(`/api/organizations/${orgId}/members`, {
        method: 'POST',
        body: JSON.stringify({ callsign: callsign.toUpperCase(), role }),
      }),
    onSuccess: (m) => {
      void queryClient.invalidateQueries({ queryKey: ['org', orgId] });
      setSuccess(`Added ${m.callsign ?? callsign}`);
      setCallsign('');
      setError(null);
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to invite');
      setSuccess(null);
    },
  });

  const emailMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string; email: string; expiresAt: string }>(
        `/api/organizations/${orgId}/invites`,
        {
          method: 'POST',
          body: JSON.stringify({ email }),
        },
      ),
    onSuccess: () => {
      setSuccess(`Invite sent to ${email}`);
      setEmail('');
      setError(null);
      setTimeout(() => setSuccess(null), 4000);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to send invite');
      setSuccess(null);
    },
  });

  return (
    <div className="border-t border-gray-200 px-4 py-3">
      <div className="flex items-center gap-3 mb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Invite Member</p>
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => setTab('callsign')}
            className={`px-2 py-0.5 rounded ${tab === 'callsign' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Callsign
          </button>
          <button
            onClick={() => setTab('email')}
            className={`px-2 py-0.5 rounded ${tab === 'email' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Email
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
      {success && <p className="text-xs text-green-600 mb-1">{success}</p>}

      {tab === 'callsign' ? (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <input
              value={callsign}
              onChange={(e) => setCallsign(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && callsign.trim()) callsignMutation.mutate();
              }}
              placeholder="Callsign"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
              className="border border-gray-300 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            onClick={() => callsign.trim() && callsignMutation.mutate()}
            disabled={!callsign.trim() || callsignMutation.isPending}
            className="bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {callsignMutation.isPending ? '…' : 'Add'}
          </button>
        </div>
      ) : (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && email.trim()) emailMutation.mutate();
              }}
              placeholder="operator@example.com"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={() => email.trim() && emailMutation.mutate()}
            disabled={!email.trim() || emailMutation.isPending}
            className="bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {emailMutation.isPending ? '…' : 'Send Invite'}
          </button>
        </div>
      )}
    </div>
  );
}

// --- Member row ---
function MemberRow({
  member,
  isAdmin,
  orgId,
}: {
  member: Member;
  isAdmin: boolean;
  orgId: string;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const removeMutation = useMutation({
    mutationFn: () =>
      apiFetch<void>(`/api/organizations/${orgId}/members/${member.operatorId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['org', orgId] }),
  });

  return (
    <li className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-mono font-medium text-gray-900">
          {member.callsign ?? member.operatorId}
        </span>
        <span
          className={`text-xs font-medium px-1.5 py-0.5 rounded ${
            member.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {member.role}
        </span>
        {member.name && (
          <span className="text-xs text-gray-400 truncate hidden sm:block">{member.name}</span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 text-xs text-gray-400">
        <span>{dateLabel(member.joinedAt)}</span>
        {isAdmin &&
          (confirming ? (
            <>
              <button
                onClick={() => {
                  setConfirming(false);
                  removeMutation.mutate();
                }}
                className="text-red-600 font-medium hover:text-red-800"
              >
                Remove
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="hover:text-red-500 transition-colors"
              aria-label="Remove member"
            >
              ×
            </button>
          ))}
      </div>
    </li>
  );
}

// --- Org detail panel ---
function OrgDetailPanel({ orgId, callerCallsign }: { orgId: string; callerCallsign: string }) {
  const {
    data: org,
    isLoading,
    isError,
  } = useQuery<OrgDetail>({
    queryKey: ['org', orgId],
    queryFn: () => apiFetch<OrgDetail>(`/api/organizations/${orgId}`),
  });

  if (isLoading) return <p className="text-sm text-gray-400 text-center py-8">Loading…</p>;
  if (isError || !org)
    return <p className="text-sm text-red-500 text-center py-8">Failed to load org.</p>;

  const callerMember = org.members.find(
    (m) => m.callsign?.toUpperCase() === callerCallsign.toUpperCase(),
  );
  const isAdmin = callerMember?.role === 'admin';

  return (
    <div className="flex flex-col h-full">
      {/* Org header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <h2 className="text-base font-semibold text-gray-900">{org.name}</h2>
        {org.callsign && <p className="text-xs text-gray-500 font-mono mt-0.5">{org.callsign}</p>}
        <p className="text-xs text-gray-400 mt-0.5">
          {org.members.length} member{org.members.length !== 1 ? 's' : ''} · Created{' '}
          {dateLabel(org.createdAt)}
        </p>
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto">
        {org.members.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No members yet.</p>
        ) : (
          <ul>
            {org.members.map((m) => (
              <MemberRow key={m.id} member={m} isAdmin={isAdmin} orgId={orgId} />
            ))}
          </ul>
        )}
      </div>

      {/* Invite form — admin only */}
      {isAdmin && <InviteForm orgId={orgId} />}
    </div>
  );
}

// --- Main OrgPage ---
export function OrgPage() {
  const { callsign } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const {
    data: orgs,
    isLoading,
    isError,
  } = useQuery<OrgSummary[]>({
    queryKey: ['orgs'],
    queryFn: () => apiFetch<OrgSummary[]>('/api/organizations'),
  });

  useEffect(() => {
    if (!selectedOrgId && orgs && orgs.length > 0) {
      setSelectedOrgId(orgs[0].id);
    }
  }, [orgs, selectedOrgId]);

  const effectiveOrgId = selectedOrgId ?? (orgs && orgs.length > 0 ? orgs[0].id : null);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3">
        <h1 className="text-xl font-semibold text-gray-900">Organization</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-700"
        >
          <span className="text-base leading-none">+</span> New
        </button>
      </div>

      {/* Org switcher (if multiple) */}
      {orgs && orgs.length > 1 && (
        <div className="flex gap-2 px-4 pb-2 overflow-x-auto">
          {orgs.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelectedOrgId(o.id)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors shrink-0 ${
                effectiveOrgId === o.id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-gray-300 text-gray-600 hover:border-indigo-400'
              }`}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading && <p className="text-sm text-gray-400 text-center py-8">Loading…</p>}
        {isError && (
          <p className="text-sm text-red-500 text-center py-8">Failed to load organizations.</p>
        )}
        {!isLoading && !isError && (!orgs || orgs.length === 0) && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8 pb-16">
            <p className="text-sm text-gray-400 mb-4">
              You are not a member of any organization yet.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              Create your first organization →
            </button>
          </div>
        )}
        {effectiveOrgId && (
          <OrgDetailPanel orgId={effectiveOrgId} callerCallsign={callsign ?? ''} />
        )}
      </div>

      {showCreate && (
        <CreateOrgModal
          onClose={() => setShowCreate(false)}
          onCreated={(org) => {
            setShowCreate(false);
            setSelectedOrgId(org.id);
          }}
        />
      )}
    </div>
  );
}
