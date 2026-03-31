-- Migration: add location fields to check_ins table (BLUAAA-76)
ALTER TABLE check_ins ADD COLUMN grid_square TEXT;
--> statement-breakpoint
ALTER TABLE check_ins ADD COLUMN latitude REAL;
--> statement-breakpoint
ALTER TABLE check_ins ADD COLUMN longitude REAL;
--> statement-breakpoint
ALTER TABLE check_ins ADD COLUMN county TEXT;
--> statement-breakpoint
ALTER TABLE check_ins ADD COLUMN city TEXT;
--> statement-breakpoint
ALTER TABLE check_ins ADD COLUMN state TEXT;
