import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { pdf, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { apiFetch } from '../../lib/api.js';

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

function durationLabel(openedAt: string | null, closedAt: string | null): string {
  if (!openedAt) return '—';
  const end = closedAt ? new Date(closedAt) : new Date();
  const ms = end.getTime() - new Date(openedAt).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// --- HTML escape helper ---
function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- ICS-309 export ---
function openIcs309(net: NetRow, checkIns: CheckIn[]): void {
  const sorted = [...checkIns].sort(
    (a, b) => new Date(a.checkedInAt).getTime() - new Date(b.checkedInAt).getTime(),
  );

  const dateStr = net.openedAt
    ? new Date(net.openedAt).toLocaleDateString([], {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    : new Date().toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' });

  const timeFrom = net.openedAt ? formatTime(net.openedAt) : '';
  const timeTo = net.closedAt ? formatTime(net.closedAt) : '';

  const rows = sorted
    .map(
      (ci, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escHtml(formatTime(ci.checkedInAt))}</td>
        <td>${escHtml(ci.operatorCallsign)}</td>
        <td>${escHtml(ci.trafficType)}</td>
        <td>${escHtml(ci.signalReport ?? '')}</td>
        <td>${escHtml(ci.remarks ?? '')}</td>
      </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ICS-309 – ${escHtml(net.name)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; background: #fff; padding: 12mm; }
    h1 { font-size: 14pt; text-align: center; margin-bottom: 2pt; }
    .form-title { text-align: center; font-size: 9pt; color: #444; margin-bottom: 8pt; }
    .header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4pt 16pt; margin-bottom: 10pt; border: 1px solid #000; padding: 6pt; }
    .field { display: flex; flex-direction: column; }
    .field label { font-size: 7pt; font-weight: bold; text-transform: uppercase; color: #555; margin-bottom: 1pt; }
    .field span { font-size: 10pt; border-bottom: 1px solid #aaa; min-height: 14pt; line-height: 14pt; padding-left: 2pt; }
    .field.wide { grid-column: 1 / -1; }
    .period-row { display: flex; gap: 12pt; }
    .period-row .field { flex: 1; }
    table { width: 100%; border-collapse: collapse; margin-top: 6pt; font-size: 9pt; }
    thead tr { background: #000; color: #fff; }
    thead th { padding: 4pt 5pt; text-align: left; font-size: 8pt; font-weight: bold; }
    tbody tr:nth-child(even) { background: #f5f5f5; }
    tbody td { padding: 3pt 5pt; border-bottom: 1px solid #ddd; vertical-align: top; }
    td:first-child, th:first-child { text-align: center; width: 28pt; }
    td:nth-child(2), th:nth-child(2) { width: 44pt; }
    td:nth-child(3), th:nth-child(3) { width: 72pt; font-family: monospace; font-weight: bold; }
    td:nth-child(4), th:nth-child(4) { width: 60pt; }
    td:nth-child(5), th:nth-child(5) { width: 36pt; }
    .footer { margin-top: 10pt; font-size: 8pt; color: #666; text-align: right; }
    @media print {
      body { padding: 10mm; }
      button { display: none; }
    }
  </style>
</head>
<body>
  <h1>ICS 309 – Communications Log</h1>
  <p class="form-title">Incident Command System</p>

  <div class="header-grid">
    <div class="field wide">
      <label>1. Incident / Net Name</label>
      <span>${escHtml(net.name)}</span>
    </div>
    <div class="field">
      <label>2. Date</label>
      <span>${escHtml(dateStr)}</span>
    </div>
    <div class="field">
      <label>3. Operational Period</label>
      <span>${escHtml(timeFrom)}${timeTo ? ' – ' + escHtml(timeTo) : ''}</span>
    </div>
    <div class="field">
      <label>4. Net Control / Radio Operator</label>
      <span>${escHtml(net.netControl)}</span>
    </div>
    <div class="field">
      <label>5. Station ID / Frequency</label>
      <span>${escHtml(net.frequency.toFixed(3))} MHz – ${escHtml(net.mode)}</span>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Time</th>
        <th>Callsign</th>
        <th>Traffic</th>
        <th>RST</th>
        <th>Remarks / Message</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="6" style="text-align:center;color:#888;padding:8pt">No check-ins recorded</td></tr>'}
    </tbody>
  </table>

  <div class="footer">
    ICS 309 · ${escHtml(net.name)} · Prepared ${escHtml(new Date().toLocaleString())}
  </div>

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

// --- CSV export ---
function buildCsvBlob(net: NetRow, checkIns: CheckIn[]): Blob {
  const header = ['#', 'Callsign', 'Time', 'RST', 'Traffic', 'Remarks'];
  const rows = checkIns.map((ci, i) => [
    String(i + 1),
    ci.operatorCallsign,
    formatDateTime(ci.checkedInAt),
    ci.signalReport ?? '',
    ci.trafficType,
    ci.remarks ?? '',
  ]);

  const lines = [header, ...rows].map((r) =>
    r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','),
  );

  lines.unshift(
    `"Net","${net.name.replace(/"/g, '""')}"`,
    `"Frequency","${net.frequency.toFixed(3)} MHz"`,
    `"Mode","${net.mode}"`,
    `"Net Control","${net.netControl}"`,
    `"Opened","${net.openedAt ? formatDateTime(net.openedAt) : '—'}"`,
    `"Closed","${net.closedAt ? formatDateTime(net.closedAt) : '—'}"`,
    `"Duration","${durationLabel(net.openedAt, net.closedAt)}"`,
    '',
  );

  return new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
}

function downloadCsv(net: NetRow, checkIns: CheckIn[]): void {
  const blob = buildCsvBlob(net, checkIns);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `net-${net.name.replace(/\s+/g, '-').toLowerCase()}-summary.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- PDF export ---
const pdfStyles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#111827' },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#6b7280', marginBottom: 16 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16, gap: 16 },
  metaItem: { minWidth: 100 },
  metaLabel: { fontSize: 8, color: '#6b7280', textTransform: 'uppercase', marginBottom: 2 },
  metaValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  colNum: { width: 28 },
  colCallsign: { width: 80 },
  colTime: { width: 90 },
  colRst: { width: 40 },
  colTraffic: { width: 70 },
  colRemarks: { flex: 1 },
  headerText: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#374151' },
  cellText: { fontSize: 9 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statBox: {
    flex: 1,
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statLabel: { fontSize: 8, color: '#6b7280', marginBottom: 2 },
  statValue: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 8 },
});

function NetPdfDocument({ net, checkIns }: { net: NetRow; checkIns: CheckIn[] }) {
  const counts: Record<TrafficType, number> = {
    routine: 0,
    welfare: 0,
    priority: 0,
    emergency: 0,
  };
  for (const ci of checkIns) counts[ci.trafficType]++;

  const sorted = [...checkIns].sort(
    (a, b) => new Date(a.checkedInAt).getTime() - new Date(b.checkedInAt).getTime(),
  );

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <Text style={pdfStyles.title}>{net.name}</Text>
        <Text style={pdfStyles.subtitle}>Net Closing Summary</Text>

        <View style={pdfStyles.meta}>
          <View style={pdfStyles.metaItem}>
            <Text style={pdfStyles.metaLabel}>Frequency</Text>
            <Text style={pdfStyles.metaValue}>{net.frequency.toFixed(3)} MHz</Text>
          </View>
          <View style={pdfStyles.metaItem}>
            <Text style={pdfStyles.metaLabel}>Mode</Text>
            <Text style={pdfStyles.metaValue}>{net.mode}</Text>
          </View>
          <View style={pdfStyles.metaItem}>
            <Text style={pdfStyles.metaLabel}>Net Control</Text>
            <Text style={pdfStyles.metaValue}>{net.netControl}</Text>
          </View>
          <View style={pdfStyles.metaItem}>
            <Text style={pdfStyles.metaLabel}>Opened</Text>
            <Text style={pdfStyles.metaValue}>
              {net.openedAt ? formatDateTime(net.openedAt) : '—'}
            </Text>
          </View>
          <View style={pdfStyles.metaItem}>
            <Text style={pdfStyles.metaLabel}>Closed</Text>
            <Text style={pdfStyles.metaValue}>
              {net.closedAt ? formatDateTime(net.closedAt) : '—'}
            </Text>
          </View>
          <View style={pdfStyles.metaItem}>
            <Text style={pdfStyles.metaLabel}>Duration</Text>
            <Text style={pdfStyles.metaValue}>{durationLabel(net.openedAt, net.closedAt)}</Text>
          </View>
        </View>

        <View style={pdfStyles.statsRow}>
          <View style={pdfStyles.statBox}>
            <Text style={pdfStyles.statLabel}>Total Check-Ins</Text>
            <Text style={pdfStyles.statValue}>{checkIns.length}</Text>
          </View>
          {counts.emergency > 0 && (
            <View style={pdfStyles.statBox}>
              <Text style={pdfStyles.statLabel}>Emergency</Text>
              <Text style={pdfStyles.statValue}>{counts.emergency}</Text>
            </View>
          )}
          {counts.priority > 0 && (
            <View style={pdfStyles.statBox}>
              <Text style={pdfStyles.statLabel}>Priority</Text>
              <Text style={pdfStyles.statValue}>{counts.priority}</Text>
            </View>
          )}
          {counts.welfare > 0 && (
            <View style={pdfStyles.statBox}>
              <Text style={pdfStyles.statLabel}>Welfare</Text>
              <Text style={pdfStyles.statValue}>{counts.welfare}</Text>
            </View>
          )}
          <View style={pdfStyles.statBox}>
            <Text style={pdfStyles.statLabel}>Routine</Text>
            <Text style={pdfStyles.statValue}>{counts.routine}</Text>
          </View>
        </View>

        <Text style={pdfStyles.sectionTitle}>Check-In Log</Text>

        <View style={pdfStyles.tableHeader}>
          <Text style={[pdfStyles.headerText, pdfStyles.colNum]}>#</Text>
          <Text style={[pdfStyles.headerText, pdfStyles.colCallsign]}>Callsign</Text>
          <Text style={[pdfStyles.headerText, pdfStyles.colTime]}>Time</Text>
          <Text style={[pdfStyles.headerText, pdfStyles.colRst]}>RST</Text>
          <Text style={[pdfStyles.headerText, pdfStyles.colTraffic]}>Traffic</Text>
          <Text style={[pdfStyles.headerText, pdfStyles.colRemarks]}>Remarks</Text>
        </View>

        {sorted.map((ci, i) => (
          <View key={ci.id} style={pdfStyles.tableRow}>
            <Text style={[pdfStyles.cellText, pdfStyles.colNum]}>{i + 1}</Text>
            <Text style={[pdfStyles.cellText, pdfStyles.colCallsign]}>{ci.operatorCallsign}</Text>
            <Text style={[pdfStyles.cellText, pdfStyles.colTime]}>
              {formatDateTime(ci.checkedInAt)}
            </Text>
            <Text style={[pdfStyles.cellText, pdfStyles.colRst]}>{ci.signalReport ?? ''}</Text>
            <Text style={[pdfStyles.cellText, pdfStyles.colTraffic]}>{ci.trafficType}</Text>
            <Text style={[pdfStyles.cellText, pdfStyles.colRemarks]}>{ci.remarks ?? ''}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

async function downloadPdf(net: NetRow, checkIns: CheckIn[]): Promise<void> {
  const blob = await pdf(<NetPdfDocument net={net} checkIns={checkIns} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `net-${net.name.replace(/\s+/g, '-').toLowerCase()}-summary.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Main page ---
export function NetSummaryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const netQuery = useQuery<NetRow>({
    queryKey: ['net', id],
    queryFn: () => apiFetch<NetRow>(`/api/nets/${id}`),
  });

  const checkInsQuery = useQuery<CheckIn[]>({
    queryKey: ['check-ins', id],
    queryFn: () => apiFetch<CheckIn[]>(`/api/nets/${id}/check-ins`),
  });

  const net = netQuery.data;
  const checkIns = checkInsQuery.data ?? [];

  const sortedCheckIns = [...checkIns].sort(
    (a, b) => new Date(a.checkedInAt).getTime() - new Date(b.checkedInAt).getTime(),
  );

  const counts: Record<TrafficType, number> = { routine: 0, welfare: 0, priority: 0, emergency: 0 };
  for (const ci of checkIns) counts[ci.trafficType]++;

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
      <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading…</div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{net.name}</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              {net.frequency.toFixed(3)} MHz · {net.mode} · Net Control: {net.netControl}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadCsv(net, checkIns)}
              className="text-xs font-medium text-gray-600 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50"
            >
              Export CSV
            </button>
            <button
              onClick={() => openIcs309(net, checkIns)}
              className="text-xs font-medium text-gray-600 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50"
            >
              ICS-309
            </button>
            <button
              onClick={() => void downloadPdf(net, checkIns)}
              className="text-xs font-medium text-indigo-600 border border-indigo-300 rounded px-3 py-1.5 hover:bg-indigo-50"
            >
              Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* Back link */}
      <div className="px-4 pt-3 pb-1">
        <button onClick={() => navigate('/')} className="text-xs text-indigo-600 hover:underline">
          ← All Nets
        </button>
        {net.status !== 'closed' && (
          <button
            onClick={() => navigate(`/nets/${id}`)}
            className="ml-4 text-xs text-indigo-600 hover:underline"
          >
            ← Back to Session
          </button>
        )}
      </div>

      {/* Stats cards */}
      <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Total Check-Ins</p>
          <p className="text-2xl font-bold text-gray-900">{checkIns.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Duration</p>
          <p className="text-2xl font-bold text-gray-900">
            {durationLabel(net.openedAt, net.closedAt)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Opened</p>
          <p className="text-sm font-medium text-gray-900">
            {net.openedAt ? formatTime(net.openedAt) : '—'}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Closed</p>
          <p className="text-sm font-medium text-gray-900">
            {net.closedAt ? formatTime(net.closedAt) : net.status === 'open' ? 'Open' : '—'}
          </p>
        </div>
      </div>

      {/* Traffic breakdown */}
      {checkIns.length > 0 && (
        <div className="px-4 pb-4 flex flex-wrap gap-2">
          {(['routine', 'welfare', 'priority', 'emergency'] as const).map((t) =>
            counts[t] > 0 ? (
              <span
                key={t}
                className={`text-xs font-medium px-2.5 py-1 rounded-full ${TRAFFIC_BADGE[t]}`}
              >
                {counts[t]} {t}
              </span>
            ) : null,
          )}
        </div>
      )}

      {/* Check-in table */}
      <div className="px-4 pb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Check-In Log</h3>
        {checkIns.length === 0 ? (
          <p className="text-sm text-gray-400">No check-ins recorded for this net.</p>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-10">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    Callsign
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Time</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-14">
                    RST
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Traffic</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Remarks</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {sortedCheckIns.map((ci, i) => (
                  <tr key={ci.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 text-sm font-mono font-medium text-gray-900">
                      {ci.operatorCallsign}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {formatTime(ci.checkedInAt)}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-500">
                      {ci.signalReport ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs font-medium px-1.5 py-0.5 rounded ${TRAFFIC_BADGE[ci.trafficType as TrafficType]}`}
                      >
                        {ci.trafficType}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{ci.remarks ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
