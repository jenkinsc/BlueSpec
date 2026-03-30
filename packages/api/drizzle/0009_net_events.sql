CREATE TABLE `net_events` (
	`id` text PRIMARY KEY NOT NULL,
	`net_id` text NOT NULL,
	`operator_id` text,
	`event_type` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`net_id`) REFERENCES `nets`(`id`) ON UPDATE no action ON DELETE no action
);
