-- SQLite requires table recreation to make `severity` nullable and add M2 columns.
CREATE TABLE `incidents_new` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `description` text,
  `severity` text,
  `status` text NOT NULL DEFAULT 'reported',
  `location` text,
  `incident_type` text,
  `activation_level` integer,
  `served_agency` text,
  `net_id` text REFERENCES nets(id),
  `created_by_operator_id` text REFERENCES operators(id),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `resolved_at` text
);
--> statement-breakpoint
INSERT INTO `incidents_new` (id, title, description, severity, status, location, created_at, updated_at, resolved_at)
  SELECT id, title, description, severity, status, location, created_at, updated_at, resolved_at FROM `incidents`;
--> statement-breakpoint
DROP TABLE `incidents`;
--> statement-breakpoint
ALTER TABLE `incidents_new` RENAME TO `incidents`;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `incident_activities` (
  `id` text PRIMARY KEY NOT NULL,
  `incident_id` text NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  `operator_id` text NOT NULL REFERENCES operators(id),
  `note` text NOT NULL,
  `created_at` text NOT NULL
);
