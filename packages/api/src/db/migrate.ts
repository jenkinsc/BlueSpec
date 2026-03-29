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

await migrate(db, { migrationsFolder });
console.log('Migrations applied successfully.');
client.close();
