CREATE TABLE `check_ins` (
	`id` text PRIMARY KEY NOT NULL,
	`net_id` text NOT NULL,
	`operator_callsign` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`traffic_count` integer DEFAULT 0 NOT NULL,
	`signal_report` text,
	`remarks` text,
	`checked_in_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`net_id`) REFERENCES `nets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`severity` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`location` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE TABLE `nets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`frequency` real NOT NULL,
	`mode` text DEFAULT 'FM' NOT NULL,
	`schedule` text,
	`net_control` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`incident_id` text,
	`started_at` text,
	`closed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `operators` (
	`id` text PRIMARY KEY NOT NULL,
	`callsign` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`license_class` text,
	`password_hash` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operators_callsign_unique` ON `operators` (`callsign`);