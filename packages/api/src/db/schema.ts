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
  severity: text('severity'), // M1 legacy field (unused in M2)
  // M2 status: 'reported' | 'active' | 'resolved' | 'cancelled'
  status: text('status').notNull().default('reported'),
  location: text('location'),
  // M2 fields
  incidentType: text('incident_type'),
  activationLevel: integer('activation_level'), // 1=local, 2=regional, 3=state/federal
  servedAgency: text('served_agency'),
  netId: text('net_id'), // FK to nets(id) enforced by migration; no Drizzle ref to avoid circular
  createdByOperatorId: text('created_by_operator_id').references(() => operators.id),
  organizationId: text('organization_id'), // FK to organizations(id); set when X-Org-Id header present (BLUAAA-37)
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  resolvedAt: text('resolved_at'), // M1 legacy field
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
  organizationId: text('organization_id'), // FK to organizations(id); set when X-Org-Id header present (BLUAAA-37)
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
  role: text('role'), // 'NET_CONTROL' | 'RELAY' | 'MOBILE' | 'PORTABLE' | 'FIXED' | 'EOC' | 'EMCOMM'
  mode: text('mode'), // 'SSB' | 'FM' | 'AM' | 'DIGITAL' | 'PACKET' | 'WINLINK' | 'OTHER'
  signalReport: text('signal_report'), // RST scale e.g. "59", "579"
  remarks: text('remarks'),
  acknowledgedAt: text('acknowledged_at'),
  // Location fields (BLUAAA-76)
  gridSquare: text('grid_square'), // Maidenhead locator e.g. "EM28"
  latitude: real('latitude'),
  longitude: real('longitude'),
  county: text('county'),
  city: text('city'),
  state: text('state'),
  checkedInAt: text('checked_in_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Incident activity log — append-only entries tracking real-time status
export const incidentActivities = sqliteTable('incident_activities', {
  id: text('id').primaryKey(),
  incidentId: text('incident_id')
    .notNull()
    .references(() => incidents.id),
  operatorId: text('operator_id')
    .notNull()
    .references(() => operators.id),
  note: text('note').notNull(),
  createdAt: text('created_at').notNull(),
});

// Organizations — groups of operators
export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  callsign: text('callsign'),
  createdAt: text('created_at').notNull(),
});

// Organization members
export const organizationMembers = sqliteTable('organization_members', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  operatorId: text('operator_id')
    .notNull()
    .references(() => operators.id),
  role: text('role').notNull().default('member'), // 'admin' | 'member'
  joinedAt: text('joined_at').notNull(),
});

// Net templates — reusable net configuration presets
export const netTemplates = sqliteTable('net_templates', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id')
    .notNull()
    .references(() => operators.id),
  organizationId: text('organization_id'), // FK to organizations(id); set when X-Org-Id header present (BLUAAA-37)
  name: text('name').notNull(),
  frequency: text('frequency').notNull(), // decimal string e.g. "146.520"
  mode: text('mode').notNull().default('FM'),
  region: text('region'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Organization invites — email-based magic-link invite flow (BLUAAA-43)
export const orgInvites = sqliteTable('org_invites', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(), // SHA-256 of the raw JWT invite token
  invitedByOperatorId: text('invited_by_operator_id')
    .notNull()
    .references(() => operators.id),
  acceptedAt: text('accepted_at'),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
});

// Net events — append-only timeline log per net (BLUAAA-75)
export const NET_EVENT_TYPES = [
  'check_in',
  'check_out',
  'status_change',
  'role_change',
  'mode_change',
  'location_change',
  'comment',
  'net_open',
  'net_close',
  'incident_created',
  'incident_resolved',
  'weather_alert',
  'weather_alert_cleared',
] as const;

export type NetEventType = (typeof NET_EVENT_TYPES)[number];

export const netEvents = sqliteTable('net_events', {
  id: text('id').primaryKey(),
  netId: text('net_id')
    .notNull()
    .references(() => nets.id),
  operatorId: text('operator_id'), // nullable — some events are system-generated
  eventType: text('event_type').notNull(), // NetEventType
  note: text('note'),
  editedAt: text('edited_at'), // set when a comment is edited (BLUAAA-104)
  createdAt: text('created_at').notNull(),
});

export type NetEventRow = typeof netEvents.$inferSelect;
export type NewNetEventRow = typeof netEvents.$inferInsert;

export type OperatorRow = typeof operators.$inferSelect;
export type NewOperatorRow = typeof operators.$inferInsert;
export type IncidentRow = typeof incidents.$inferSelect;
export type NewIncidentRow = typeof incidents.$inferInsert;
export type NetRow = typeof nets.$inferSelect;
export type NewNetRow = typeof nets.$inferInsert;
export type CheckInRow = typeof checkIns.$inferSelect;
export type NewCheckInRow = typeof checkIns.$inferInsert;
export type IncidentActivityRow = typeof incidentActivities.$inferSelect;
export type NewIncidentActivityRow = typeof incidentActivities.$inferInsert;
export type NetTemplateRow = typeof netTemplates.$inferSelect;
export type NewNetTemplateRow = typeof netTemplates.$inferInsert;
export type OrganizationRow = typeof organizations.$inferSelect;
export type NewOrganizationRow = typeof organizations.$inferInsert;
export type OrganizationMemberRow = typeof organizationMembers.$inferSelect;
export type NewOrganizationMemberRow = typeof organizationMembers.$inferInsert;
