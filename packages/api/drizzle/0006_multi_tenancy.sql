ALTER TABLE `nets` ADD COLUMN `organization_id` text;
--> statement-breakpoint
ALTER TABLE `incidents` ADD COLUMN `organization_id` text;
--> statement-breakpoint
ALTER TABLE `net_templates` ADD COLUMN `organization_id` text;
