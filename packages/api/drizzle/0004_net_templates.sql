CREATE TABLE IF NOT EXISTS `net_templates` (
  `id` text PRIMARY KEY NOT NULL,
  `operator_id` text NOT NULL REFERENCES operators(id),
  `name` text NOT NULL,
  `frequency` text NOT NULL,
  `mode` text NOT NULL DEFAULT 'FM',
  `region` text,
  `notes` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
