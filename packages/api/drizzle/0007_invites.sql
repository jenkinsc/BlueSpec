CREATE TABLE IF NOT EXISTS `org_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL UNIQUE,
	`invited_by_operator_id` text NOT NULL,
	`accepted_at` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_operator_id`) REFERENCES `operators`(`id`) ON UPDATE no action ON DELETE no action
);
