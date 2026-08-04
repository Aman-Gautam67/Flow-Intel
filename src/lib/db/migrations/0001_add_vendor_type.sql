ALTER TABLE "dependencies" ADD COLUMN IF NOT EXISTS "vendor_type" varchar(32) NOT NULL DEFAULT 'saas';
