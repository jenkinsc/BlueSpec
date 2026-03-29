ALTER TABLE `nets` ADD COLUMN `net_control_id` text REFERENCES operators(id);
--> statement-breakpoint
ALTER TABLE `nets` ADD COLUMN `opened_at` text;
