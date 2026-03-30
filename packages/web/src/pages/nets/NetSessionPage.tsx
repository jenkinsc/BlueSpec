import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.tsx';

// --- NWS Weather Alerts panel ---
interface NWSAlert {
  id: string;
  properties: {
    event: string;
    severity: string;
    onset: string | null;
    expires: string | null;
  };
}

interface NWSAlertsResponse {
  features: NWSAlert[];
}

const SEVERITY_BADGE: Record<string, string> = {
  Extreme: 'bg-red-100 text-red-800',
  Severe: 'bg-orange-100 text-orange-800',
  Moderate: 'bg-yellow-100 text-yellow-800',
  Minor: 'bg-blue-100 text-blue-700',
  Unknown: 'bg-gray-100 text-gray-600',
};

function formatAlertTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function WeatherAlertsPanel({ netId }: { netId: string }) {
  const storageKey = `nws_wfo_net_${netId}`;
  const [collapsed, setCollapsed] = useState(false);
  const [wfo, setWfo] = useState<string>(() => localStorage.getItem(storageKey) ?? '');
  const [editingWfo, setEditingWfo] = useState(false);
  const [wfoInput, setWfoInput] = useState('');

  const { data, isLoading, isError } = useQuery<NWSAlertsResponse>({
    queryKey: ['nws-alerts', wfo],
    queryFn: async () => {
      const res = await fetch(`https://api.weather.gov/alerts/active?office=${wfo}`, {
        headers: { Accept: 'application/geo+json' },
      });
      if (!res.ok) throw new Error(`NWS API error: ${res.status}`);
      return res.json() as Promise<NWSAlertsResponse>;
    },
    enabled: !!wfo,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });

  const alerts = data?.features ?? [];

  const saveWfo = () => {
    const val = wfoInput.trim().toUpperCase();
    setWfo(val);
    if (val) {
      localStorage.setItem(storageKey, val);
    } else {
      localStorage.removeItem(storageKey);
    }
    setEditingWfo(false);
  };

  const openEdit = () => {
    setWfoInput(wfo);
    setEditingWfo(true);
    setCollapsed(false);
  };

  return (
    <div className="border-b border-sky-200 bg-sky-50">
      <div className="flex items-center justify-between px-4 py-2">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-sky-700"
        >
          <span>Weather Alerts{alerts.length > 0 ? ` (${alerts.length})` : ''}</span>
          <span>{collapsed ? '▾' : '▴'}</span>
        </button>
        <button
          onClick={openEdit}
          className="text-xs text-sky-600 hover:text-sky-800 px-1"
          title="Configure NWS office"
          aria-label="Configure NWS office"
        >
          ⚙
        </button>
      </div>
      {!collapsed && (
        <div className="px-4 pb-2">
          {editingWfo && (
            <div className="mb-2 p-2 bg-white border border-sky-200 rounded">
              <p className="text-xs text-gray-500 mb-1">
                Enter a{' '}
                <a
                  href="https://www.weather.gov/srh/nwsoffices"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline"
                >
                  NWS WFO code
                </a>{' '}
                (e.g. LWX, OKX, LOT)
              </p>
              <div className="flex gap-1">
                <input
                  value={wfoInput}
                  onChange={(e) => setWfoInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveWfo();
                    if (e.key === 'Escape') setEditingWfo(false);
                  }}
                  placeholder="e.g. LWX"
                  maxLength={4}
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-sky-400"
                  autoFocus
                />
                <button
                  onClick={saveWfo}
                  className="text-xs bg-sky-600 text-white rounded px-2 py-1 hover:bg-sky-700"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingWfo(false)}
                  className="text-xs text-gray-500 hover:text-gray-700 px-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {!wfo ? (
            <p className="text-xs text-sky-500">
              Set NWS office to see alerts.{' '}
              <button onClick={openEdit} className="text-indigo-600 hover:underline">
                Configure
              </button>
            </p>
          ) : isLoading ? (
            <p className="text-xs text-sky-400">Loading alerts…</p>
          ) : isError ? (
            <p className="text-xs text-red-500">Failed to fetch weather alerts.</p>
          ) : alerts.length === 0 ? (
            <p className="text-xs text-sky-400">No active alerts for {wfo}.</p>
          ) : (
            <ul className="space-y-1.5">
              {alerts.map((alert) => (
                <li key={alert.id}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium text-gray-900">{alert.properties.event}</span>
                    <span
                      className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                        SEVERITY_BADGE[alert.properties.severity] ?? SEVERITY_BADGE.Unknown
                      }`}
                    >
                      {alert.properties.severity}
                    </span>
                  </div>
                  {(alert.properties.onset ?? alert.properties.expires) && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {alert.properties.onset && (
                        <span>From {formatAlertTime(alert.properties.onset)}</span>
                      )}
                      {alert.properties.onset && alert.properties.expires && <span> · </span>}
                      {alert.properties.expires && (
                        <span>Until {formatAlertTime(alert.properties.expires)}</span>
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// --- Incident sidebar types ---
interface Incident {
  id: string;
  title: string;
  status: string;
  incidentType: string | null;
}

function IncidentSidebar({ netId }: { netId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [otherCollapsed, setOtherCollapsed] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState('');
  const [formLevel, setFormLevel] = useState<1 | 2 | 3>(1);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: netIncidents } = useQuery<Incident[]>({
    queryKey: ['incidents-net', netId],
    queryFn: () => apiFetch<Incident[]>(`/api/incidents?netId=${netId}&status=active`),
    refetchInterval: 30_000,
  });

  const { data: allIncidents } = useQuery<Incident[]>({
    queryKey: ['incidents-org-active'],
    queryFn: () => apiFetch<Incident[]>('/api/incidents?status=active'),
    refetchInterval: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<Incident>('/api/incidents', {
        method: 'POST',
        body: JSON.stringify({
          title: formTitle,
          incident_type: formType,
          activation_level: formLevel,
          net_id: netId,
        }),
      }),
    onSuccess: () => {
      setShowForm(false);
      setFormTitle('');
      setFormType('');
      setFormLevel(1);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['incidents-net', netId] });
      void queryClient.invalidateQueries({ queryKey: ['incidents-org-active'] });
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Failed to create incident');
    },
  });

  const thisNetIncidents = netIncidents ?? [];
  const netIncidentIds = new Set(thisNetIncidents.map((i) => i.id));
  const otherIncidents = (allIncidents ?? []).filter((i) => !netIncidentIds.has(i.id));

  const count = thisNetIncidents.length;

  return (
    <div className="border-b border-orange-200 bg-orange-50">
      <div className="flex items-center justify-between px-4 py-2">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-orange-700"
        >
          <span>This Net{count > 0 ? ` (${count})` : ''}</span>
          <span>{collapsed ? '▾' : '▴'}</span>
        </button>
        <button
          onClick={() => { setCollapsed(false); setShowForm((v) => !v); }}
          className="text-xs font-medium text-orange-700 border border-orange-300 rounded px-2 py-0.5 hover:bg-orange-100"
        >
          + New Incident
        </button>
      </div>
      {!collapsed && (
        <div className="px-4 pb-2">
          {showForm && (
            <div className="mb-2 p-2 bg-white border border-orange-200 rounded">
              {formError && <p className="text-xs text-red-600 mb-1">{formError}</p>}
              <div className="flex flex-col gap-1.5">
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Title"
                  className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                />
                <input
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  placeholder="Incident type"
                  className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                />
                <select
                  value={formLevel}
                  onChange={(e) => setFormLevel(Number(e.target.value) as 1 | 2 | 3)}
                  className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                >
                  <option value={1}>Level 1</option>
                  <option value={2}>Level 2</option>
                  <option value={3}>Level 3</option>
                </select>
                <div className="flex gap-1 justify-end">
                  <button
                    onClick={() => { setShowForm(false); setFormError(null); }}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => createMutation.mutate()}
                    disabled={createMutation.isPending || !formTitle || !formType}
                    className="text-xs bg-orange-600 text-white rounded px-2 py-1 hover:bg-orange-700 disabled:opacity-50"
                  >
                    {createMutation.isPending ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          )}
          {count === 0 ? (
            <p className="text-xs text-orange-500">No active incidents linked to this net.</p>
          ) : (
            <ul className="space-y-1">
              {thisNetIncidents.map((i) => (
                <li key={i.id}>
                  <button
                    onClick={() => navigate(`/incidents/${i.id}`)}
                    className="text-xs text-orange-800 hover:underline text-left"
                  >
                    {i.title}{i.incidentType ? ` — ${i.incidentType}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {otherIncidents.length > 0 && (
        <div className="border-t border-orange-200">
          <div className="flex items-center px-4 py-2">
            <button
              onClick={() => setOtherCollapsed((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-orange-600"
            >
              <span>Other Active ({otherIncidents.length})</span>
              <span>{otherCollapsed ? '▾' : '▴'}</span>
            </button>
          </div>
          {!otherCollapsed && (
            <div className="px-4 pb-2">
              <ul className="space-y-1">
                {otherIncidents.map((i) => (
                  <li key={i.id}>
                    <button
                      onClick={() => navigate(`/incidents/${i.id}`)}
                      className="text-xs text-orange-700 hover:underline text-left"
                    >
                      {i.title}{i.incidentType ? ` — ${i.incidentType}` : ''}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface NetRow {
  id: string;
  name: string;
  frequency: number;
  mode: string;
  schedule: string | null;
  netControl: string;
  netControlId: string | null;
  status: 'draft' | 'open' | 'closed';
  openedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CheckIn {
  id: string;
  netId: string;
  operatorId: string | null;
  operatorCallsign: string;
  trafficType: 'routine' | 'welfare' | 'priority' | 'emergency';
  signalReport: string | null;
  remarks: string | null;
  checkedInAt: string;
  updatedAt: string;
}

type TrafficType = 'routine' | 'welfare' | 'priority' | 'emergency';

const TRAFFIC_BADGE: Record<TrafficType, string> = {
  routine: 'bg-gray-100 text-gray-600',
  welfare: 'bg-blue-100 text-blue-700',
  priority: 'bg-yellow-100 text-yellow-700',
  emergency: 'bg-red-100 text-red-700',
};

function elapsedLabel(openedAt: string | null): string {
  if (!openedAt) return '';
  const ms = Date.now() - new Date(openedAt).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function NetStatusBar({
  net,
  checkInCount,
  isNetControl,
  onCloseNet,
  closing,
}: {
  net: NetRow;
  checkInCount: number;
  isNetControl: boolean;
  onCloseNet: () => void;
  closing: boolean;
}) {
  const dotColor =
    net.status === 'open'
      ? 'bg-green-500'
      : net.status === 'draft'
      ? 'bg-yellow-400'
      : 'bg-gray-400';

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-start justify-between">
      <div>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
          <h2 className="text-base font-semibold text-gray-900">{net.name}</h2>
          <span className="text-xs text-gray-400 font-mono">
            {checkInCount} {checkInCount === 1 ? 'station' : 'stations'}
          </span>
        </div>
        <p className="text-xs text-gray-500 font-mono mt-0.5">
          {net.frequency.toFixed(3)} MHz · {net.mode} · {net.netControl}
          {net.status === 'open' && net.openedAt ? ` · ${elapsedLabel(net.openedAt)}` : ''}
        </p>
      </div>
      {isNetControl && net.status === 'open' && (
        <button
          onClick={onCloseNet}
          disabled={closing}
          className="text-xs font-medium text-red-600 border border-red-300 rounded px-2 py-1 hover:bg-red-50 disabled:opacity-50"
        >
          {closing ? 'Closing…' : 'Close Net'}
        </button>
      )}
    </div>
  );
}

function CheckInListItem({
  checkIn,
  canRemove,
  onRemove,
}: {
  checkIn: CheckIn;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-mono font-medium text-gray-900 shrink-0">
          {checkIn.operatorCallsign}
        </span>
        <span className="text-xs text-gray-400 shrink-0">{timeLabel(checkIn.checkedInAt)}</span>
        {checkIn.signalReport && (
          <span className="text-xs font-mono text-gray-500 shrink-0">{checkIn.signalReport}</span>
        )}
        <span
          className={`text-xs font-medium px-1.5 py-0.5 rounded ${TRAFFIC_BADGE[checkIn.trafficType as TrafficType]}`}
        >
          {checkIn.trafficType}
        </span>
        {checkIn.remarks && (
          <span className="text-xs text-gray-500 truncate">{checkIn.remarks}</span>
        )}
      </div>
      {canRemove && (
        <div className="ml-2 flex-shrink-0">
          {confirming ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setConfirming(false);
                  onRemove();
                }}
                className="text-xs text-red-600 font-medium hover:text-red-800"
              >
                Remove
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              aria-label="Remove check-in"
            >
              ×
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function CheckInEntryForm({
  netId,
  netOpen,
  callsign,
  isNetControl,
  onCheckedIn,
}: {
  netId: string;
  netOpen: boolean;
  callsign: string;
  isNetControl: boolean;
  onCheckedIn: () => void;
}) {
  const callsignRef = useRef<HTMLInputElement>(null);
  const [enteredCallsign, setEnteredCallsign] = useState(callsign);
  const [signal, setSignal] = useState('59');
  const [traffic, setTraffic] = useState<TrafficType>('routine');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<CheckIn>(`/api/nets/${netId}/check-ins`, {
        method: 'POST',
        body: JSON.stringify({
          signal_report: signal || undefined,
          traffic_type: traffic,
          remarks: remarks || undefined,
          operator_callsign: isNetControl ? enteredCallsign || undefined : undefined,
        }),
      }),
    onSuccess: () => {
      setEnteredCallsign(callsign);
      setSignal('59');
      setTraffic('routine');
      setRemarks('');
      setError(null);
      onCheckedIn();
      callsignRef.current?.focus();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Check-in failed');
    },
  });

  useEffect(() => {
    callsignRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      mutation.mutate();
    }
  };

  if (!netOpen) return null;

  return (
    <div className="bg-white border-t border-gray-200 px-4 py-3">
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="flex items-end gap-2">
        {/* Callsign — editable for net control, read-only otherwise */}
        <div className="flex-1 min-w-0">
          <label className="block text-xs text-gray-500 mb-1">Callsign</label>
          <input
            ref={callsignRef}
            value={isNetControl ? enteredCallsign : callsign}
            readOnly={!isNetControl}
            onChange={isNetControl ? (e) => setEnteredCallsign(e.target.value.toUpperCase()) : undefined}
            onKeyDown={handleKeyDown}
            className={`w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isNetControl ? '' : 'bg-gray-50'}`}
          />
        </div>

        {/* Signal report */}
        <div className="w-16">
          <label className="block text-xs text-gray-500 mb-1">RST</label>
          <input
            value={signal}
            onChange={(e) => setSignal(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={3}
            className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="59"
          />
        </div>

        {/* Traffic type */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Traffic</label>
          <select
            value={traffic}
            onChange={(e) => setTraffic(e.target.value as TrafficType)}
            onKeyDown={handleKeyDown}
            className="border border-gray-300 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {(['routine', 'welfare', 'priority', 'emergency'] as const).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Remarks */}
        <div className="flex-1 min-w-0 hidden sm:block">
          <label className="block text-xs text-gray-500 mb-1">Remarks</label>
          <input
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Optional"
          />
        </div>

        {/* Submit */}
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50 shrink-0"
        >
          {mutation.isPending ? '…' : 'Check In'}
        </button>
      </div>

      {/* Remarks (mobile) */}
      <div className="mt-2 sm:hidden">
        <input
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Remarks (optional)"
        />
      </div>
    </div>
  );
}

export function NetSessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { callsign } = useAuth();
  const queryClient = useQueryClient();

  const netQuery = useQuery<NetRow>({
    queryKey: ['net', id],
    queryFn: () => apiFetch<NetRow>(`/api/nets/${id}`),
    refetchInterval: 15_000,
  });

  const checkInsQuery = useQuery<CheckIn[]>({
    queryKey: ['check-ins', id],
    queryFn: () => apiFetch<CheckIn[]>(`/api/nets/${id}/check-ins`),
    refetchInterval: netQuery.data?.status === 'open' ? 15_000 : false,
  });

  const closeMutation = useMutation({
    mutationFn: () => apiFetch<NetRow>(`/api/nets/${id}/close`, { method: 'POST' }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['net', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['nets'] });
      navigate(`/nets/${id}/summary`);
    },
  });

  const removeCheckIn = useMutation({
    mutationFn: (checkInId: string) =>
      apiFetch<void>(`/api/nets/${id}/check-ins/${checkInId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['check-ins', id] });
    },
  });

  const net = netQuery.data;
  const checkIns = checkInsQuery.data ?? [];

  // Newest-first
  const sortedCheckIns = [...checkIns].sort(
    (a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime(),
  );

  const isNetControl =
    !!net &&
    !!callsign &&
    net.netControl.toUpperCase() === callsign.toUpperCase();

  if (netQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-sm text-red-500 gap-2">
        <p>Failed to load net.</p>
        <button onClick={() => navigate('/')} className="text-indigo-600 hover:underline">
          Back to Nets
        </button>
      </div>
    );
  }

  if (!net) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <NetStatusBar
        net={net}
        checkInCount={checkIns.length}
        isNetControl={isNetControl}
        onCloseNet={() => closeMutation.mutate()}
        closing={closeMutation.isPending}
      />

      {/* Incident sidebar */}
      <IncidentSidebar netId={id!} />

      {/* Weather alerts panel */}
      <WeatherAlertsPanel netId={id!} />

      {/* Back link */}
      <div className="px-4 pt-2 pb-1">
        <button
          onClick={() => navigate('/')}
          className="text-xs text-indigo-600 hover:underline"
        >
          ← All Nets
        </button>
      </div>

      {/* Check-in list */}
      <div className="flex-1 overflow-y-auto">
        {checkInsQuery.isLoading && checkIns.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">Loading check-ins…</div>
        ) : sortedCheckIns.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            No check-ins yet.
            {net.status === 'open' ? ' Use the form below to check in.' : ''}
          </div>
        ) : (
          <ul>
            {sortedCheckIns.map((ci) => (
              <CheckInListItem
                key={ci.id}
                checkIn={ci}
                canRemove={isNetControl && net.status === 'open'}
                onRemove={() => removeCheckIn.mutate(ci.id)}
              />
            ))}
          </ul>
        )}
        {net.status === 'closed' && (
          <div className="px-4 py-4 text-center">
            <button
              onClick={() => navigate(`/nets/${id}/summary`)}
              className="text-sm text-indigo-600 hover:underline font-medium"
            >
              View Closing Summary →
            </button>
          </div>
        )}
      </div>

      {/* Entry form — only for open nets */}
      <CheckInEntryForm
        netId={id!}
        netOpen={net.status === 'open'}
        callsign={callsign ?? ''}
        isNetControl={isNetControl}
        onCheckedIn={() => void queryClient.invalidateQueries({ queryKey: ['check-ins', id] })}
      />
    </div>
  );
}
