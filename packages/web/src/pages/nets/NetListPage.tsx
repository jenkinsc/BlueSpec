import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { CreateNetModal } from './CreateNetModal.js';

type NetStatus = 'draft' | 'open' | 'closed';

interface NetRow {
  id: string;
  name: string;
  frequency: number;
  mode: string;
  schedule: string | null;
  netControl: string;
  status: NetStatus;
  openedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  checkInCount?: number;
}

type Tab = 'all' | 'open' | 'closed';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
];

function useNets(status: Tab) {
  return useQuery<NetRow[]>({
    queryKey: ['nets', status],
    queryFn: () =>
      apiFetch<NetRow[]>(`/api/nets?status=${status}&includeCounts=true`),
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}

function elapsedLabel(openedAt: string | null): string {
  if (!openedAt) return '';
  const ms = Date.now() - new Date(openedAt).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatClosedDate(closedAt: string | null): string {
  if (!closedAt) return '';
  return new Date(closedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function StatusDot({ status }: { status: NetStatus }) {
  const color =
    status === 'open'
      ? 'bg-green-500'
      : status === 'draft'
        ? 'bg-yellow-400'
        : 'bg-gray-400';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

interface NetRowItemProps {
  net: NetRow;
  onOpen: (id: string) => void;
}

function NetRowItem({ net, onOpen }: NetRowItemProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openError, setOpenError] = useState<string | null>(null);

  const openMutation = useMutation({
    mutationFn: () =>
      apiFetch<NetRow>(`/api/nets/${net.id}/open`, { method: 'POST' }),
    onSuccess: () => {
      setOpenError(null);
      void queryClient.invalidateQueries({ queryKey: ['nets'] });
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : 'Failed to open net. Please try again.';
      setOpenError(message);
    },
  });

  let action: React.ReactNode;
  if (net.status === 'draft') {
    action = (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            openMutation.mutate();
          }}
          disabled={openMutation.isPending}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-300 rounded px-2 py-1 disabled:opacity-50"
        >
          {openMutation.isPending ? 'Opening…' : 'Open Net'}
        </button>
        {openError && (
          <p className="text-xs text-red-600 max-w-[160px] text-right">{openError}</p>
        )}
      </div>
    );
  } else if (net.status === 'open') {
    action = (
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/nets/${net.id}`);
        }}
        className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded px-2 py-1"
      >
        Join →
      </button>
    );
  } else {
    action = (
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/nets/${net.id}/summary`);
        }}
        className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded px-2 py-1"
      >
        Summary
      </button>
    );
  }

  const checkInLabel =
    net.checkInCount !== undefined
      ? `${net.checkInCount} check-in${net.checkInCount !== 1 ? 's' : ''}`
      : null;

  let statusDetail: string;
  if (net.status === 'open' && net.openedAt) {
    statusDetail = `Open ${elapsedLabel(net.openedAt)}`;
  } else if (net.status === 'closed' && net.closedAt) {
    statusDetail = `Closed ${formatClosedDate(net.closedAt)}`;
  } else if (net.status === 'draft') {
    statusDetail = 'Draft';
  } else {
    statusDetail = net.status;
  }

  return (
    <li
      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer"
      onClick={() => {
        if (net.status !== 'closed') navigate(`/nets/${net.id}`);
        else navigate(`/nets/${net.id}/summary`);
      }}
    >
      <div className="flex items-start gap-2 min-w-0">
        <span className="mt-1.5">
          <StatusDot status={net.status} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{net.name}</p>
          <p className="text-xs text-gray-500 font-mono">
            {net.frequency.toFixed(3)} MHz · {net.mode} · {net.netControl}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {statusDetail}
            {checkInLabel ? ` · ${checkInLabel}` : ''}
          </p>
        </div>
      </div>
      <div className="ml-3 flex-shrink-0">{action}</div>
    </li>
  );
}

function TabPanel({ tab, onOpen }: { tab: Tab; onOpen: (id: string) => void }) {
  const { data, isLoading, isError } = useNets(tab);

  if (isLoading) {
    return (
      <div className="px-4 py-8 text-center text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-4 py-8 text-center text-sm text-red-500">
        Failed to load nets.
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-sm text-gray-400">
        No {tab === 'all' ? '' : tab + ' '}nets.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100">
      {data.map((net) => (
        <NetRowItem key={net.id} net={net} onOpen={onOpen} />
      ))}
    </ul>
  );
}

export function NetListPage() {
  const [activeTab, setActiveTab] = useState<Tab>('open');
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  const handleCreated = (net: NetRow) => {
    setShowCreate(false);
    // New nets start as draft — switch to all tab so it's visible
    setActiveTab('all');
    // Navigate to the net's session page if opened immediately
    if (net.status === 'open') navigate(`/nets/${net.id}`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2">
        <h1 className="text-xl font-semibold text-gray-900">Nets</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-sm"
        >
          <span className="text-base leading-none">+</span> Create Net
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 px-4">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`mr-4 pb-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        <TabPanel tab={activeTab} onOpen={() => {}} />
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateNetModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
