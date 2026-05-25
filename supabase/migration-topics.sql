-- Run this in the Supabase SQL Editor to add topic support.
-- Safe to run multiple times (uses IF NOT EXISTS / IF NOT ADD).

-- Tag articles with topic buckets during classification
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS topics text[] DEFAULT '{}';

-- Store topic preferences on subscribers
ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS topic_digest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS topics       text[]  DEFAULT '{}';
