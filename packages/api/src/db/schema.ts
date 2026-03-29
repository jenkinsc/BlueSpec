import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Operators — licensed amateur radio operators
export const operators = sqliteTable('operators', {
  id: text('id').primaryKey(),
  callsign: text('callsign').notNull().unique(),
  name: text('name').notNull(),
  email: text('email'),
  licenseClass: text('license_class'), // 'technician' | 'general' | 'extra'
  // Password hash for callsign-based auth (BLUAAA-5)
  passwordHash: text('password_hash'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Incidents — emergency activations or events
export const incidents = sqliteTable('incidents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  severity: text('severity').notNull(), // 'routine' | 'urgent' | 'emergency'
  status: text('status').notNull().default('open'), // 'open' | 'monitoring' | 'resolved'
  location: text('location'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  resolvedAt: text('resolved_at'),
});

// Nets — radio nets (scheduled or ad-hoc)
export const nets = sqliteTable('nets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  frequency: real('frequency').notNull(), // MHz, e.g. 146.520
  mode: text('mode').notNull().default('FM'), // 'FM' | 'SSB' | 'CW' | 'DMR' | 'D-STAR' | 'FT8' | 'other'
  schedule: text('schedule'), // cron or human-readable description
  netControl: text('net_control').notNull(), // operator callsign (set on create)
  netControlId: text('net_control_id').references(() => operators.id), // FK set on open
  status: text('status').notNull().default('draft'), // 'draft' | 'open' | 'closed'
  incidentId: text('incident_id').references(() => incidents.id),
  openedAt: text('opened_at'),
  startedAt: text('started_at'),
  closedAt: text('closed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Check-ins — operator check-ins to a net session
export const checkIns = sqliteTable('check_ins', {
  id: text('id').primaryKey(),
  netId: text('net_id')
    .notNull()
    .references(() => nets.id),
  operatorId: text('operator_id').references(() => operators.id), // FK from JWT (added M2)
  operatorCallsign: text('operator_callsign').notNull(),
  status: text('status').notNull().default('active'), // 'active' | 'standby' | 'signed_off'
  trafficCount: integer('traffic_count').notNull().default(0),
  trafficType: text('traffic_type').notNull().default('routine'), // 'routine' | 'welfare' | 'priority' | 'emergency'
  signalReport: text('signal_report'), // RST scale e.g. "59", "579"
  remarks: text('remarks'),
  acknowledgedAt: text('acknowledged_at'),
  checkedInAt: text('checked_in_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type OperatorRow = typeof operators.$inferSelect;
export type NewOperatorRow = typeof operators.$inferInsert;
export type IncidentRow = typeof incidents.$inferSelect;
export type NewIncidentRow = typeof incidents.$inferInsert;
export type NetRow = typeof nets.$inferSelect;
export type NewNetRow = typeof nets.$inferInsert;
export type CheckInRow = typeof checkIns.$inferSelect;
export type NewCheckInRow = typeof checkIns.$inferInsert;
