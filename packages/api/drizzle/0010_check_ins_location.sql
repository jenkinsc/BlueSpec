-- Migration: add location fields to check_ins table (BLUAAA-76)
ALTER TABLE check_ins ADD COLUMN grid_square TEXT;
ALTER TABLE check_ins ADD COLUMN latitude REAL;
ALTER TABLE check_ins ADD COLUMN longitude REAL;
ALTER TABLE check_ins ADD COLUMN county TEXT;
ALTER TABLE check_ins ADD COLUMN city TEXT;
ALTER TABLE check_ins ADD COLUMN state TEXT;
