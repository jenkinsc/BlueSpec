import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.env.DATABASE_URL ?? 'file:emcomm.db';
const migrationsFolder = path.join(__dirname, '../../drizzle');

const client = createClient({ url });
const db = drizzle(client);

// Backfill __drizzle_migrations records for schema changes already present in the DB.
// Needed because journal timestamps were updated in commit 8c768fc to fix ordering on
// fresh installs. Production databases recorded migrations under the OLD timestamps,
// so Drizzle now sees 0001-0007 as unapplied and tries to re-run them — causing
// "duplicate column" errors on the already-existing schema.
async function backfillMigrationRecords(): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    )
  `);

  const lastRow = await client.execute(
    'SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1'
  );
  const lastTimestamp = Number(lastRow.rows[0]?.[0] ?? 0);

  // New journal timestamps (post-8c768fc) paired with a schema probe query.
  // If the probe returns a non-zero count the migration was already applied.
  const pending = [
    {
      when: 1774811403000,
      tag: '0001_net_management_m2',
      probe: `SELECT COUNT(*) FROM pragma_table_info('nets') WHERE name='net_control_id'`,
    },
    {
      when: 1774811404000,
      tag: '0002_checkin_flow_m2',
      probe: `SELECT COUNT(*) FROM pragma_table_info('check_ins') WHERE name='operator_id'`,
    },
    {
      when: 1774811405000,
      tag: '0003_incident_tracking_m2',
      probe: `SELECT COUNT(*) FROM pragma_table_info('incidents') WHERE name='incident_type'`,
    },
    {
      when: 1774811406000,
      tag: '0004_net_templates',
      probe: `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='net_templates'`,
    },
    {
      when: 1774811407000,
      tag: '0005_organizations',
      probe: `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='organizations'`,
    },
    {
      when: 1774811408000,
      tag: '0006_multi_tenancy',
      probe: `SELECT COUNT(*) FROM pragma_table_info('nets') WHERE name='organization_id'`,
    },
    {
      when: 1774811409000,
      tag: '0007_invites',
      probe: `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='org_invites'`,
    },
  ];

  for (const m of pending) {
    if (lastTimestamp >= m.when) continue; // already recorded with this timestamp

    const probeResult = await client.execute(m.probe);
    const alreadyApplied = Number(probeResult.rows[0]?.[0] ?? 0) > 0;

    if (alreadyApplied) {
      console.log(`Backfilling migration record: ${m.tag} (schema already present)`);
      await client.execute({
        sql: 'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
        args: [`backfilled:${m.tag}`, m.when],
      });
    }
  }
}

await backfillMigrationRecords();
await migrate(db, { migrationsFolder });
console.log('Migrations applied successfully.');
client.close();
