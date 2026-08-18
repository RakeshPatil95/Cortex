# Supabase Storage Setup for Legal Documents

This guide will help you set up Supabase storage for secure file handling in the legal case management system.

## Prerequisites

1. Supabase project created
2. Database schema deployed (Prisma migration completed)
3. Authentication configured

## Setup Steps

### 1. Install Required Packages

```bash
npm install @supabase/supabase-js --legacy-peer-deps
```

### 2. Environment Variables

Add these to your `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 3. Create Storage Bucket

Run the SQL commands in your Supabase SQL Editor:

#### Option A: Essential Setup (Recommended)
```sql
-- Copy and paste the contents of supabase-bucket-setup.sql
```

#### Option B: Advanced Setup (Full Features)
```sql
-- Copy and paste the contents of supabase-storage-setup.sql
```

### 4. Verify Setup

1. Go to your Supabase Dashboard
2. Navigate to Storage
3. Verify the `legal-documents` bucket is created
4. Check that RLS policies are active

## File Structure

Files will be stored with the following structure:
```
legal-documents/
└── cases/
    └── {serialNumber}/
        └── documents/
            ├── DOC-{timestamp}-{random}.pdf
            ├── DOC-{timestamp}-{random}.docx
            └── ...
```

## Security Features

- **Private Bucket**: Files are not publicly accessible
- **RLS Policies**: Users can only access their own case files
- **File Type Validation**: Only allowed file types can be uploaded
- **Size Limits**: 10MB maximum file size
- **Signed URLs**: Secure temporary access to files

## API Usage

The system automatically handles:
- File upload to Supabase storage
- Secure file access via signed URLs
- File cleanup when cases are deleted
- Permission validation

## Troubleshooting

### Common Issues

1. **File Upload Fails**
   - Check file size (must be < 10MB)
   - Verify file type is allowed
   - Ensure user is authenticated

2. **Permission Denied**
   - Verify RLS policies are active
   - Check user authentication
   - Ensure case ownership

3. **Storage Bucket Not Found**
   - Run the SQL setup commands
   - Check bucket name is exactly `legal-documents`

### Debug Commands

```sql
-- Check if bucket exists
SELECT * FROM storage.buckets WHERE id = 'legal-documents';

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'objects';

-- Check file permissions
SELECT * FROM storage.objects WHERE bucket_id = 'legal-documents' LIMIT 5;
```

## File Management

### Upload Process
1. File is validated (type, size)
2. Unique filename generated
3. File uploaded to `cases/{serialNumber}/documents/`
4. Database record created with file metadata

### Access Process
1. User requests document access
2. System verifies case ownership
3. Signed URL generated (1 hour expiry)
4. User can download file securely

### Cleanup Process
1. When case is deleted
2. All associated files are removed from storage
3. Database records are cleaned up (cascade)

## Monitoring

Monitor your storage usage in the Supabase Dashboard:
- Storage → Overview
- Check file counts and storage usage
- Monitor API calls and bandwidth

## Backup Considerations

- Supabase handles automatic backups
- Consider additional backup strategy for critical documents
- Test restore procedures regularly
