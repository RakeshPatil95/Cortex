-- Supabase Storage Setup for Legal Documents
-- Run these commands in your Supabase SQL Editor

-- 1. Create the legal-documents storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'legal-documents',
  'legal-documents',
  false, -- Private bucket
  10485760, -- 10MB file size limit
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/jpg',
    'image/png'
  ]
);

-- 2. Create RLS policies for the storage bucket

-- Policy: Users can upload files to their own cases
CREATE POLICY "Users can upload files to their own cases"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'legal-documents' AND
  auth.uid()::text = (
    SELECT created_by_id::text 
    FROM legal_cases 
    WHERE serial_number = (string_to_array(storage.filename(name), '/'))[2]
  )
);

-- Policy: Users can view files from their own cases
CREATE POLICY "Users can view files from their own cases"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'legal-documents' AND
  auth.uid()::text = (
    SELECT created_by_id::text 
    FROM legal_cases 
    WHERE serial_number = (string_to_array(storage.filename(name), '/'))[2]
  )
);

-- Policy: Users can update files in their own cases
CREATE POLICY "Users can update files in their own cases"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'legal-documents' AND
  auth.uid()::text = (
    SELECT created_by_id::text 
    FROM legal_cases 
    WHERE serial_number = (string_to_array(storage.filename(name), '/'))[2]
  )
);

-- Policy: Users can delete files from their own cases
CREATE POLICY "Users can delete files from their own cases"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'legal-documents' AND
  auth.uid()::text = (
    SELECT created_by_id::text 
    FROM legal_cases 
    WHERE serial_number = (string_to_array(storage.filename(name), '/'))[2]
  )
);

-- 3. Enable RLS on storage.objects (if not already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 4. Create a function to get file path from case serial number
CREATE OR REPLACE FUNCTION get_case_file_path(case_serial_number text, file_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 'cases/' || case_serial_number || '/documents/' || file_name;
$$;

-- 5. Create a function to validate file upload permissions
CREATE OR REPLACE FUNCTION can_upload_to_case(case_serial_number text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM legal_cases 
    WHERE serial_number = case_serial_number 
    AND created_by_id = auth.uid()::text
  );
$$;

-- 6. Create a function to get all files for a case
CREATE OR REPLACE FUNCTION get_case_files(case_serial_number text)
RETURNS TABLE (
  name text,
  size bigint,
  mime_type text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    o.name,
    o.metadata->>'size'::bigint as size,
    o.metadata->>'mimetype' as mime_type,
    o.created_at,
    o.updated_at
  FROM storage.objects o
  WHERE o.bucket_id = 'legal-documents'
  AND o.name LIKE 'cases/' || case_serial_number || '/documents/%'
  AND auth.uid()::text = (
    SELECT created_by_id::text 
    FROM legal_cases 
    WHERE serial_number = case_serial_number
  );
$$;

-- 7. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_storage_objects_bucket_name 
ON storage.objects (bucket_id, name);

CREATE INDEX IF NOT EXISTS idx_legal_cases_serial_number 
ON legal_cases (serial_number);

-- 8. Grant necessary permissions
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT EXECUTE ON FUNCTION get_case_file_path(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION can_upload_to_case(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_case_files(text) TO authenticated;

-- 9. Create a trigger to automatically clean up files when a case is deleted
CREATE OR REPLACE FUNCTION cleanup_case_files()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete all files associated with the case
  DELETE FROM storage.objects 
  WHERE bucket_id = 'legal-documents'
  AND name LIKE 'cases/' || OLD.serial_number || '/documents/%';
  
  RETURN OLD;
END;
$$;

CREATE TRIGGER trigger_cleanup_case_files
  BEFORE DELETE ON legal_cases
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_case_files();

-- 10. Create a view for case documents with file information
CREATE OR REPLACE VIEW case_documents_with_files AS
SELECT 
  cd.id,
  cd.unique_document_id,
  cd.case_id,
  cd.title,
  cd.file_name,
  cd.original_name,
  cd.description,
  cd.file_size,
  cd.mime_type,
  cd.file_path,
  cd.document_type,
  cd.uploaded_at,
  cd.uploaded_by_id,
  u.name as uploaded_by_name,
  u.email as uploaded_by_email,
  lc.serial_number as case_serial_number,
  -- File metadata from storage
  so.metadata->>'size' as storage_file_size,
  so.metadata->>'mimetype' as storage_mime_type,
  so.created_at as storage_created_at,
  so.updated_at as storage_updated_at
FROM case_documents cd
JOIN legal_cases lc ON cd.case_id = lc.id
LEFT JOIN users u ON cd.uploaded_by_id = u.id
LEFT JOIN storage.objects so ON so.bucket_id = 'legal-documents' AND so.name = cd.file_path
WHERE lc.created_by_id = auth.uid()::text;

-- Grant access to the view
GRANT SELECT ON case_documents_with_files TO authenticated;

-- 11. Create a function to generate signed URLs for documents
CREATE OR REPLACE FUNCTION get_document_signed_url(document_id text, expires_in integer DEFAULT 3600)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  file_path text;
  case_owner_id text;
BEGIN
  -- Get file path and verify ownership
  SELECT cd.file_path, lc.created_by_id
  INTO file_path, case_owner_id
  FROM case_documents cd
  JOIN legal_cases lc ON cd.case_id = lc.id
  WHERE cd.id = document_id::text
  AND lc.created_by_id = auth.uid()::text;
  
  IF file_path IS NULL THEN
    RAISE EXCEPTION 'Document not found or access denied';
  END IF;
  
  -- Return the file path (client will use this with Supabase client to generate signed URL)
  RETURN file_path;
END;
$$;

GRANT EXECUTE ON FUNCTION get_document_signed_url(text, integer) TO authenticated;
