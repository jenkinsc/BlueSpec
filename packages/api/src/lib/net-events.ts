import { db } from '../db/index.js';
import { netEvents } from '../db/schema.js';
import type { NetEventType } from '../db/schema.js';
import { newId } from './ids.js';

/**
 * Append an event row to the net_events timeline.
 * operatorId is null for system-generated events.
 */
export async function appendNetEvent(
  netId: string,
  eventType: NetEventType,
  operatorId: string | null,
  note?: string,
): Promise<void> {
  await db.insert(netEvents).values({
    id: newId(),
    netId,
    operatorId,
    eventType,
    note: note ?? null,
    createdAt: new Date().toISOString(),
  });
}
