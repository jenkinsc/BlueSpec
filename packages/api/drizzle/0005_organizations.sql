CREATE TABLE IF NOT EXISTS `organizations` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `callsign` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `organization_members` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  `operator_id` text NOT NULL REFERENCES operators(id),
  `role` text NOT NULL DEFAULT 'member',
  `joined_at` text NOT NULL,
  UNIQUE(`organization_id`, `operator_id`)
);
