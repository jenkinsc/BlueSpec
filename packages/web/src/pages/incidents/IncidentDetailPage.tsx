import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api.js';

type IncidentStatus = 'reported' | 'active' | 'resolved' | 'cancelled';

interface Activity {
  id: string;
  incidentId: string;
  operatorId: string;
  note: string;
  createdAt: string;
}

interface IncidentDetail {
  id: string;
  title: string;
  incidentType: string | null;
  activationLevel: number | null;
  servedAgency: string | null;
  description: string | null;
  location: string | null;
  status: IncidentStatus;
  netId: string | null;
  createdAt: string;
  updatedAt: string;
  activities: Activity[];
}

const STATUS_COLORS: Record<IncidentStatus, string> = {
  reported: 'bg-yellow-100 text-yellow-700',
  active: 'bg-red-100 text-red-700',
  resolved: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

const LEVEL_LABELS: Record<number, string> = {
  1: 'Local',
  2: 'Regional',
  3: 'State/Fed',
};

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AddActivityForm({ incidentId, onAdded }: { incidentId: string; onAdded: () => void }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<Activity>(`/api/incidents/${incidentId}/activities`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      setNote('');
      setError(null);
      onAdded();
      inputRef.current?.focus();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to add note'),
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && note.trim()) {
      e.preventDefault();
      mutation.mutate();
    }
  };

  return (
    <div className="border-t border-gray-200 px-4 py-3 bg-white">
      {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add activity note…"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={() => note.trim() && mutation.mutate()}
          disabled={!note.trim() || mutation.isPending}
          className="bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {mutation.isPending ? '…' : 'Add'}
        </button>
      </div>
    </div>
  );
}

export function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logEndRef = useRef<HTMLDivElement>(null);

  const {
    data: incident,
    isLoading,
    isError,
  } = useQuery<IncidentDetail>({
    queryKey: ['incident', id],
    queryFn: () => apiFetch<IncidentDetail>(`/api/incidents/${id}`),
  });

  const transitionMutation = useMutation({
    mutationFn: (status: IncidentStatus) =>
      apiFetch<IncidentDetail>(`/api/incidents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['incident', id], (old: IncidentDetail | undefined) =>
        old ? { ...old, status: updated.status } : old,
      );
      void queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
  });

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [incident?.activities?.length]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading…</div>
    );
  }

  if (isError || !incident) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-sm text-red-500 gap-2">
        <p>Failed to load incident.</p>
        <button onClick={() => navigate('/incidents')} className="text-indigo-600 hover:underline">
          Back to Incidents
        </button>
      </div>
    );
  }

  const canActivate = incident.status === 'reported';
  const canResolve = incident.status === 'active';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3">
        <button
          onClick={() => navigate('/incidents')}
          className="text-xs text-indigo-600 hover:underline mb-2 block"
        >
          ← Incidents
        </button>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900 leading-snug">{incident.title}</h2>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded shrink-0 ${STATUS_COLORS[incident.status]}`}
          >
            {incident.status}
          </span>
        </div>
        {/* Metadata */}
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
          {incident.incidentType && (
            <>
              <dt className="font-medium text-gray-700">Type</dt>
              <dd>{incident.incidentType}</dd>
            </>
          )}
          {incident.activationLevel && (
            <>
              <dt className="font-medium text-gray-700">Level</dt>
              <dd>
                {incident.activationLevel} – {LEVEL_LABELS[incident.activationLevel]}
              </dd>
            </>
          )}
          {incident.servedAgency && (
            <>
              <dt className="font-medium text-gray-700">Agency</dt>
              <dd>{incident.servedAgency}</dd>
            </>
          )}
          {incident.location && (
            <>
              <dt className="font-medium text-gray-700">Location</dt>
              <dd>{incident.location}</dd>
            </>
          )}
        </dl>
        {incident.description && (
          <p className="mt-2 text-xs text-gray-600">{incident.description}</p>
        )}

        {/* Status transition buttons */}
        {(canActivate || canResolve) && (
          <div className="flex gap-2 mt-3">
            {canActivate && (
              <button
                onClick={() => transitionMutation.mutate('active')}
                disabled={transitionMutation.isPending}
                className="text-xs font-medium bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 disabled:opacity-50"
              >
                {transitionMutation.isPending ? '…' : 'Activate'}
              </button>
            )}
            {canResolve && (
              <button
                onClick={() => transitionMutation.mutate('resolved')}
                disabled={transitionMutation.isPending}
                className="text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 disabled:opacity-50"
              >
                {transitionMutation.isPending ? '…' : 'Resolve'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Activity log */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Activity Log
        </h3>
        {incident.activities.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No activity yet.</p>
        ) : (
          <ul className="space-y-2">
            {incident.activities.map((a) => (
              <li key={a.id} className="text-sm">
                <span className="text-xs text-gray-400 mr-2">{timeLabel(a.createdAt)}</span>
                <span className="text-gray-800">{a.note}</span>
              </li>
            ))}
          </ul>
        )}
        <div ref={logEndRef} />
      </div>

      {/* Add activity form — always visible unless terminal */}
      {incident.status !== 'resolved' && incident.status !== 'cancelled' && (
        <AddActivityForm
          incidentId={id!}
          onAdded={() => void queryClient.invalidateQueries({ queryKey: ['incident', id] })}
        />
      )}
    </div>
  );
}
