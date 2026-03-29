import { db } from './index.js';
import { operators, incidents, nets, checkIns } from './schema.js';

const now = new Date().toISOString();

const seedOperators = [
  {
    id: 'op-1',
    callsign: 'W1AW',
    name: 'Hiram Percy Maxim',
    email: 'w1aw@arrl.org',
    licenseClass: 'extra',
    passwordHash: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'op-2',
    callsign: 'KD9ABC',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    licenseClass: 'general',
    passwordHash: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'op-3',
    callsign: 'N5XYZ',
    name: 'Bob Martinez',
    email: 'bob@example.com',
    licenseClass: 'technician',
    passwordHash: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'op-4',
    callsign: 'WB4GHI',
    name: 'Carol Williams',
    email: 'carol@example.com',
    licenseClass: 'extra',
    passwordHash: null,
    createdAt: now,
    updatedAt: now,
  },
];

const seedIncidents = [
  {
    id: 'inc-1',
    title: 'Severe Weather — Tornado Watch County 4',
    description: 'NWS has issued a tornado watch for the county. Activating ARES response.',
    severity: 'urgent' as const,
    status: 'open' as const,
    location: 'County 4, State',
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  },
  {
    id: 'inc-2',
    title: 'Routine EmComm Exercise',
    description: 'Monthly served-agency communications drill.',
    severity: 'routine' as const,
    status: 'resolved' as const,
    location: null,
    createdAt: now,
    updatedAt: now,
    resolvedAt: now,
  },
];

const seedNets = [
  {
    id: 'net-1',
    name: 'County ARES Weekly Net',
    frequency: 146.52,
    mode: 'FM',
    schedule: 'Mondays 19:00 local',
    netControl: 'W1AW',
    status: 'scheduled' as const,
    incidentId: null,
    startedAt: null,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'net-2',
    name: 'Tornado Watch Activation Net',
    frequency: 147.195,
    mode: 'FM',
    schedule: null,
    netControl: 'WB4GHI',
    status: 'active' as const,
    incidentId: 'inc-1',
    startedAt: now,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  },
];

const seedCheckIns = [
  {
    id: 'ci-1',
    netId: 'net-2',
    operatorCallsign: 'KD9ABC',
    status: 'active' as const,
    trafficCount: 0,
    signalReport: '5-9',
    remarks: 'Monitoring from EOC',
    checkedInAt: now,
    updatedAt: now,
  },
  {
    id: 'ci-2',
    netId: 'net-2',
    operatorCallsign: 'N5XYZ',
    status: 'standby' as const,
    trafficCount: 1,
    signalReport: '5-7',
    remarks: null,
    checkedInAt: now,
    updatedAt: now,
  },
];

async function seed() {
  console.log('Seeding database...');

  await db.insert(operators).values(seedOperators).onConflictDoNothing();
  console.log(`  Inserted ${seedOperators.length} operators`);

  await db.insert(incidents).values(seedIncidents).onConflictDoNothing();
  console.log(`  Inserted ${seedIncidents.length} incidents`);

  await db.insert(nets).values(seedNets).onConflictDoNothing();
  console.log(`  Inserted ${seedNets.length} nets`);

  await db.insert(checkIns).values(seedCheckIns).onConflictDoNothing();
  console.log(`  Inserted ${seedCheckIns.length} check-ins`);

  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
