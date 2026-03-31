import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api.js';

type IncidentStatus = 'reported' | 'active' | 'resolved' | 'cancelled';

interface Incident {
  id: string;
  title: string;
  incidentType: string | null;
  activationLevel: number | null;
  servedAgency: string | null;
  location: string | null;
  status: IncidentStatus;
  netId: string | null;
  createdAt: string;
  updatedAt: string;
}

type StatusFilter = 'active' | 'reported' | 'resolved' | 'all';

const TABS: { key: StatusFilter; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'reported', label: 'Reported' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

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

function useIncidents(status: StatusFilter) {
  const url = status === 'all' ? '/api/incidents' : `/api/incidents?status=${status}`;
  return useQuery<Incident[]>({
    queryKey: ['incidents', status],
    queryFn: () => apiFetch<Incident[]>(url),
    staleTime: 15_000,
  });
}

interface CreateModalProps {
  onClose: () => void;
  onCreated: (incident: Incident) => void;
}

function CreateIncidentModal({ onClose, onCreated }: CreateModalProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [type, setType] = useState('');
  const [level, setLevel] = useState('1');
  const [agency, setAgency] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<Incident>('/api/incidents', {
        method: 'POST',
        body: JSON.stringify({
          title,
          incident_type: type,
          activation_level: parseInt(level, 10),
          served_agency: agency || undefined,
          location: location || undefined,
          description: description || undefined,
        }),
      }),
    onSuccess: (incident) => {
      void queryClient.invalidateQueries({ queryKey: ['incidents'] });
      onCreated(incident);
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
          <h2 className="text-lg font-semibold text-gray-900">New Incident</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">
            ×
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Flash flooding — County Road 4"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <input
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Flood, Fire, Search…"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Level</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="1">1 – Local</option>
                <option value="2">2 – Regional</option>
                <option value="3">3 – State/Fed</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Served Agency <span className="text-gray-400">(optional)</span>
            </label>
            <input
              value={agency}
              onChange={(e) => setAgency(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="County OES"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Location <span className="text-gray-400">(optional)</span>
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              disabled={!title || !type || mutation.isPending}
              className="flex-1 bg-red-600 text-white py-2 rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {mutation.isPending ? 'Creating…' : 'Create Incident'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function IncidentListPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<StatusFilter>('active');
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading, isError } = useIncidents(tab);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-5 pb-2">
        <h1 className="text-xl font-semibold text-gray-900">Incidents</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 bg-red-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-red-700"
        >
          <span className="text-base leading-none">+</span> New
        </button>
      </div>

      <div className="flex border-b border-gray-200 px-4">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`mr-4 pb-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="text-sm text-gray-400 text-center py-8">Loading…</p>}
        {isError && (
          <p className="text-sm text-red-500 text-center py-8">Failed to load incidents.</p>
        )}
        {!isLoading && !isError && (!data || data.length === 0) && (
          <p className="text-sm text-gray-400 text-center py-12">
            No {tab !== 'all' ? tab : ''} incidents.
          </p>
        )}
        {data && data.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {data.map((incident) => (
              <li
                key={incident.id}
                className="px-4 py-3 hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/incidents/${incident.id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{incident.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {incident.incidentType}
                      {incident.activationLevel
                        ? ` · Level ${incident.activationLevel} (${LEVEL_LABELS[incident.activationLevel]})`
                        : ''}
                      {incident.location ? ` · ${incident.location}` : ''}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded shrink-0 ${STATUS_COLORS[incident.status]}`}
                  >
                    {incident.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showCreate && (
        <CreateIncidentModal
          onClose={() => setShowCreate(false)}
          onCreated={(i) => {
            setShowCreate(false);
            navigate(`/incidents/${i.id}`);
          }}
        />
      )}
    </div>
  );
}
