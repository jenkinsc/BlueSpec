ALTER TABLE `check_ins` ADD COLUMN `operator_id` text REFERENCES operators(id);
--> statement-breakpoint
ALTER TABLE `check_ins` ADD COLUMN `traffic_type` text NOT NULL DEFAULT 'routine';
--> statement-breakpoint
ALTER TABLE `check_ins` ADD COLUMN `acknowledged_at` text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_check_ins_operator_net` ON `check_ins` (`operator_id`, `net_id`) WHERE `operator_id` IS NOT NULL;
