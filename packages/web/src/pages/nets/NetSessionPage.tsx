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
  const storageKey = `nws_state_net_${netId}`;
  const [collapsed, setCollapsed] = useState(false);
  const [state, setState] = useState<string>(() => localStorage.getItem(storageKey) ?? '');
  const [editingState, setEditingState] = useState(false);
  const [stateInput, setStateInput] = useState('');

  const { data, isLoading, isError } = useQuery<NWSAlertsResponse>({
    queryKey: ['nws-alerts', state],
    queryFn: async () => {
      const res = await fetch(`https://api.weather.gov/alerts/active?area=${state}`, {
        headers: { Accept: 'application/geo+json' },
      });
      if (!res.ok) throw new Error(`NWS API error: ${res.status}`);
      return res.json() as Promise<NWSAlertsResponse>;
    },
    enabled: !!state,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });

  const alerts = data?.features ?? [];

  const saveState = () => {
    const val = stateInput.trim().toUpperCase();
    setState(val);
    if (val) {
      localStorage.setItem(storageKey, val);
    } else {
      localStorage.removeItem(storageKey);
    }
    setEditingState(false);
  };

  const openEdit = () => {
    setStateInput(state);
    setEditingState(true);
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
          title="Configure state"
          aria-label="Configure state"
        >
          ⚙
        </button>
      </div>
      {!collapsed && (
        <div className="px-4 pb-2">
          {editingState && (
            <div className="mb-2 p-2 bg-white border border-sky-200 rounded">
              <p className="text-xs text-gray-500 mb-1">
                Enter a two-letter state abbreviation (e.g. VA, NY, IL)
              </p>
              <div className="flex gap-1">
                <input
                  value={stateInput}
                  onChange={(e) => setStateInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveState();
                    if (e.key === 'Escape') setEditingState(false);
                  }}
                  placeholder="e.g. VA"
                  maxLength={2}
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-sky-400"
                  autoFocus
                />
                <button
                  onClick={saveState}
                  className="text-xs bg-sky-600 text-white rounded px-2 py-1 hover:bg-sky-700"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingState(false)}
                  className="text-xs text-gray-500 hover:text-gray-700 px-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {!state ? (
            <p className="text-xs text-sky-500">
              Set state to see alerts.{' '}
              <button onClick={openEdit} className="text-indigo-600 hover:underline">
                Configure
              </button>
            </p>
          ) : isLoading ? (
            <p className="text-xs text-sky-400">Loading alerts…</p>
          ) : isError ? (
            <p className="text-xs text-red-500">Failed to fetch weather alerts.</p>
          ) : alerts.length === 0 ? (
            <p className="text-xs text-sky-400">No active alerts for {state}.</p>
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

// --- Net Timeline panel ---
interface NetEvent {
  id: string;
  netId: string;
  operatorId: string | null;
  eventType: string;
  note: string | null;
  createdAt: string;
}

const EVENT_ICON: Record<string, string> = {
  net_open: '🟢',
  net_close: '🔴',
  check_in: '✅',
  check_out: '❌',
  status_change: '🔄',
  role_change: '🎭',
  mode_change: '📻',
  location_change: '📍',
  comment: '💬',
};

function TimelinePanel({ netId, netStatus }: { netId: string; netStatus: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const { data: events = [], isLoading } = useQuery<NetEvent[]>({
    queryKey: ['net-events', netId],
    queryFn: () => apiFetch<NetEvent[]>(`/api/nets/${netId}/events`),
    refetchInterval: netStatus === 'open' ? 15_000 : false,
  });

  const addComment = useMutation({
    mutationFn: () =>
      apiFetch<NetEvent>(`/api/nets/${netId}/events`, {
        method: 'POST',
        body: JSON.stringify({ note: noteInput }),
      }),
    onSuccess: () => {
      setNoteInput('');
      setShowForm(false);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['net-events', netId] });
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Failed to post comment');
    },
  });

  return (
    <div className="border-b border-violet-200 bg-violet-50">
      <div className="flex items-center justify-between px-4 py-2">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-violet-700"
        >
          <span>Timeline{events.length > 0 ? ` (${events.length})` : ''}</span>
          <span>{collapsed ? '▾' : '▴'}</span>
        </button>
        {!!token && netStatus === 'open' && (
          <button
            onClick={() => { setCollapsed(false); setShowForm((v) => !v); }}
            className="text-xs font-medium text-violet-700 border border-violet-300 rounded px-2 py-0.5 hover:bg-violet-100"
          >
            + Comment
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="px-4 pb-2">
          {showForm && (
            <div className="mb-2 p-2 bg-white border border-violet-200 rounded">
              {formError && <p className="text-xs text-red-600 mb-1">{formError}</p>}
              <textarea
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Add a comment…"
                rows={2}
                className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 resize-none"
              />
              <div className="flex gap-1 justify-end mt-1">
                <button
                  onClick={() => { setShowForm(false); setFormError(null); }}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                >
                  Cancel
                </button>
                <button
                  onClick={() => addComment.mutate()}
                  disabled={addComment.isPending || !noteInput.trim()}
                  className="text-xs bg-violet-600 text-white rounded px-2 py-1 hover:bg-violet-700 disabled:opacity-50"
                >
                  {addComment.isPending ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
          )}
          {isLoading ? (
            <p className="text-xs text-violet-400">Loading timeline…</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-violet-400">No events yet.</p>
          ) : (
            <ul className="space-y-1.5 max-h-60 overflow-y-auto">
              {[...events].reverse().map((ev) => (
                <li key={ev.id} className="flex gap-1.5 items-start">
                  <span className="text-xs shrink-0 mt-0.5">{EVENT_ICON[ev.eventType] ?? '•'}</span>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-700 break-words">{ev.note ?? ev.eventType}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
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
    queryFn: () => apiFetch<Incident[]>(`/api/incidents?netId=${netId}`),
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

type CheckInRole = 'NET_CONTROL' | 'RELAY' | 'MOBILE' | 'PORTABLE' | 'FIXED' | 'EOC' | 'EMCOMM';
type CheckInMode = 'SSB' | 'FM' | 'AM' | 'DIGITAL' | 'PACKET' | 'WINLINK' | 'OTHER';

interface CheckIn {
  id: string;
  netId: string;
  operatorId: string | null;
  operatorCallsign: string;
  trafficType: 'routine' | 'welfare' | 'priority' | 'emergency';
  role: CheckInRole | null;
  mode: CheckInMode | null;
  signalReport: string | null;
  remarks: string | null;
  // Location fields (BLUAAA-76)
  gridSquare: string | null;
  latitude: number | null;
  longitude: number | null;
  county: string | null;
  city: string | null;
  state: string | null;
  checkedInAt: string;
  updatedAt: string;
}

/** Convert lat/lon to 4-character Maidenhead grid square (e.g. "EM28") */
function latLonToGrid(lat: number, lon: number): string {
  const adjLon = lon + 180;
  const adjLat = lat + 90;
  const fieldLon = Math.floor(adjLon / 20);
  const fieldLat = Math.floor(adjLat / 10);
  const squareLon = Math.floor((adjLon % 20) / 2);
  const squareLat = Math.floor(adjLat % 10);
  return (
    String.fromCharCode(65 + fieldLon) +
    String.fromCharCode(65 + fieldLat) +
    String(squareLon) +
    String(squareLat)
  );
}

type TrafficType = 'routine' | 'welfare' | 'priority' | 'emergency';

const TRAFFIC_BADGE: Record<TrafficType, string> = {
  routine: 'bg-gray-100 text-gray-600',
  welfare: 'bg-blue-100 text-blue-700',
  priority: 'bg-yellow-100 text-yellow-700',
  emergency: 'bg-red-100 text-red-700',
};

const CHECKIN_ROLES: CheckInRole[] = ['NET_CONTROL', 'RELAY', 'MOBILE', 'PORTABLE', 'FIXED', 'EOC', 'EMCOMM'];
const CHECKIN_MODES: CheckInMode[] = ['SSB', 'FM', 'AM', 'DIGITAL', 'PACKET', 'WINLINK', 'OTHER'];

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
  canEdit,
  onRemove,
  onEdit,
}: {
  checkIn: CheckIn;
  canRemove: boolean;
  canEdit: boolean;
  onRemove: () => void;
  onEdit: () => void;
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
        {checkIn.role && (
          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 shrink-0">
            {checkIn.role}
          </span>
        )}
        {checkIn.mode && (
          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 shrink-0">
            {checkIn.mode}
          </span>
        )}
        {checkIn.remarks && (
          <span className="text-xs text-gray-500 truncate">{checkIn.remarks}</span>
        )}
        {checkIn.gridSquare && (
          <span className="text-xs font-mono text-indigo-600 shrink-0" title="Grid square">
            {checkIn.gridSquare}
          </span>
        )}
      </div>
      <div className="ml-2 flex-shrink-0 flex items-center gap-1">
        {canEdit && (
          <button
            onClick={onEdit}
            className="text-xs text-gray-400 hover:text-indigo-500 transition-colors px-1"
            aria-label="Edit location"
            title="Edit location"
          >
            ⌖
          </button>
        )}
        {canRemove && (
          <>
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
          </>
        )}
      </div>
    </li>
  );
}

function CheckInEditPanel({
  checkIn,
  netId,
  onClose,
  onSaved,
}: {
  checkIn: CheckIn;
  netId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [grid, setGrid] = useState(checkIn.gridSquare ?? '');
  const [lat, setLat] = useState(checkIn.latitude != null ? String(checkIn.latitude) : '');
  const [lon, setLon] = useState(checkIn.longitude != null ? String(checkIn.longitude) : '');
  const [county, setCounty] = useState(checkIn.county ?? '');
  const [city, setCity] = useState(checkIn.city ?? '');
  const [state, setState] = useState(checkIn.state ?? '');
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // Auto-calculate grid when lat/lon are both valid
  const handleLatLonBlur = () => {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (!isNaN(latNum) && !isNaN(lonNum) &&
        latNum >= -90 && latNum <= 90 &&
        lonNum >= -180 && lonNum <= 180) {
      setGrid(latLonToGrid(latNum, lonNum));
    }
  };

  const mutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      if (grid !== (checkIn.gridSquare ?? '')) body.grid_square = grid || undefined;
      const latNum = lat !== '' ? parseFloat(lat) : undefined;
      const lonNum = lon !== '' ? parseFloat(lon) : undefined;
      if (latNum !== undefined && !isNaN(latNum)) body.latitude = latNum;
      if (lonNum !== undefined && !isNaN(lonNum)) body.longitude = lonNum;
      if (county !== (checkIn.county ?? '')) body.county = county || undefined;
      if (city !== (checkIn.city ?? '')) body.city = city || undefined;
      if (state !== (checkIn.state ?? '')) body.state = state || undefined;
      return apiFetch<CheckIn>(`/api/nets/${netId}/check-ins/${checkIn.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['check-ins', netId] });
      onSaved();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Save failed');
    },
  });

  return (
    <div className="border border-indigo-200 rounded-md bg-indigo-50 p-3 mx-4 my-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-indigo-800">
          Location — {checkIn.operatorCallsign}
        </span>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Grid Square</label>
          <input
            value={grid}
            onChange={(e) => setGrid(e.target.value.toUpperCase())}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="EM28"
            maxLength={6}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">County</label>
          <input
            value={county}
            onChange={(e) => setCounty(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="County"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Latitude</label>
          <input
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            onBlur={handleLatLonBlur}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="38.8977"
            type="number"
            step="any"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Longitude</label>
          <input
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            onBlur={handleLatLonBlur}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="-77.0366"
            type="number"
            step="any"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">City</label>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="City"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">State</label>
          <input
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="State"
            maxLength={2}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">
          Cancel
        </button>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="text-xs bg-indigo-600 text-white rounded px-3 py-1 hover:bg-indigo-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving…' : 'Save Location'}
        </button>
      </div>
    </div>
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
  const [role, setRole] = useState<CheckInRole | ''>('');
  const [mode, setMode] = useState<CheckInMode | ''>('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<CheckIn>(`/api/nets/${netId}/check-ins`, {
        method: 'POST',
        body: JSON.stringify({
          signal_report: signal || undefined,
          traffic_type: traffic,
          role: role || undefined,
          mode: mode || undefined,
          remarks: remarks || undefined,
          operator_callsign: isNetControl ? enteredCallsign || undefined : undefined,
        }),
      }),
    onSuccess: () => {
      setEnteredCallsign(callsign);
      setSignal('59');
      setTraffic('routine');
      setRole('');
      setMode('');
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

        {/* Role */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as CheckInRole | '')}
            onKeyDown={handleKeyDown}
            className="border border-gray-300 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">—</option>
            {CHECKIN_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* Mode */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Mode</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as CheckInMode | '')}
            onKeyDown={handleKeyDown}
            className="border border-gray-300 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">—</option>
            {CHECKIN_MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
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
  const [editingCheckInId, setEditingCheckInId] = useState<string | null>(null);

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
      {/* Mobile: stacked status + sidebars at top */}
      <div className="md:hidden shrink-0">
        <NetStatusBar
          net={net}
          checkInCount={checkIns.length}
          isNetControl={isNetControl}
          onCloseNet={() => closeMutation.mutate()}
          closing={closeMutation.isPending}
        />
        <IncidentSidebar netId={id!} />
        <WeatherAlertsPanel netId={id!} />
        <TimelinePanel netId={id!} netStatus={net.status} />
      </div>

      {/* Main body: two columns on desktop, single column on mobile */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* Left column (~60%): back link + check-in list + entry form */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="px-4 pt-2 pb-1 shrink-0">
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
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                No check-ins yet.
                {net.status === 'open' ? ' Use the form below to check in.' : ''}
              </div>
            ) : (
              <ul>
                {sortedCheckIns.map((ci) => (
                  <li key={ci.id}>
                    <CheckInListItem
                      checkIn={ci}
                      canRemove={isNetControl && net.status === 'open'}
                      canEdit={isNetControl}
                      onRemove={() => removeCheckIn.mutate(ci.id)}
                      onEdit={() => setEditingCheckInId((prev) => prev === ci.id ? null : ci.id)}
                    />
                    {editingCheckInId === ci.id && (
                      <CheckInEditPanel
                        checkIn={ci}
                        netId={id!}
                        onClose={() => setEditingCheckInId(null)}
                        onSaved={() => setEditingCheckInId(null)}
                      />
                    )}
                  </li>
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

          {/* Entry form — pinned to bottom of left column */}
          <div className="shrink-0">
            <CheckInEntryForm
              netId={id!}
              netOpen={net.status === 'open'}
              callsign={callsign ?? ''}
              isNetControl={isNetControl}
              onCheckedIn={() => void queryClient.invalidateQueries({ queryKey: ['check-ins', id] })}
            />
          </div>
        </div>

        {/* Right column (~40%): desktop only — status bar, incident sidebar, weather */}
        <div className="hidden md:flex md:flex-col md:w-2/5 shrink-0 border-l border-gray-200 overflow-y-auto">
          <NetStatusBar
            net={net}
            checkInCount={checkIns.length}
            isNetControl={isNetControl}
            onCloseNet={() => closeMutation.mutate()}
            closing={closeMutation.isPending}
          />
          <IncidentSidebar netId={id!} />
          <WeatherAlertsPanel netId={id!} />
          <TimelinePanel netId={id!} netStatus={net.status} />
        </div>
      </div>
    </div>
  );
}
