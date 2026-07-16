-- 0020: Add language column to documents table for multi-lecture support.
-- Stores the detected content language (ISO 639-1 code, e.g. 'en', 'es', 'fr', 'de').
-- Defaults to 'en' for existing documents.

alter table documents add column if not exists language text not null default 'en';

-- Rollback:
-- alter table documents drop column language;
