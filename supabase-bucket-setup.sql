-- Simple Supabase Storage Setup
-- Run this query in your Supabase SQL Editor

-- 1. Create storage bucket (this is all you need!)
INSERT INTO storage.buckets (id, name, public)
VALUES ('legal-documents', 'legal-documents', false);

-- That's it! The bucket will be created with default permissions.
-- Supabase automatically handles the RLS policies for authenticated users.
