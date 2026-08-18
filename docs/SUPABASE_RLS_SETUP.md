# Supabase RLS (Row Level Security) Setup Guide

This guide explains how to set up Row Level Security (RLS) policies for the Cortex project's Supabase database.

## 📋 Overview

Row Level Security (RLS) is a PostgreSQL feature that restricts which rows users can access in database tables. This ensures that users can only access their own data, providing an additional layer of security beyond application-level controls.

## 🔧 Setup Instructions

### 1. Access Supabase SQL Editor

1. Go to your Supabase project dashboard
2. Navigate to the **SQL Editor** tab
3. Create a new query

### 2. Run the RLS Policies

Copy and paste the contents of `supabase-rls-policies.sql` into the SQL editor and execute it.

### 3. Verify RLS is Enabled

Run the verification queries at the bottom of the SQL file to ensure RLS is working correctly.

## 🗄️ Database Tables

The RLS policies cover the following tables:

### Users Table (`users`)
- **Purpose**: Stores user account information
- **RLS Policy**: Users can only access their own records
- **Operations**: SELECT, INSERT, UPDATE, DELETE

### Accounts Table (`accounts`)
- **Purpose**: Stores OAuth account linking information
- **RLS Policy**: Users can only access their own linked accounts
- **Operations**: SELECT, INSERT, UPDATE, DELETE

### Sessions Table (`sessions`)
- **Purpose**: Stores user session information
- **RLS Policy**: Users can only access their own sessions
- **Operations**: SELECT, INSERT, UPDATE, DELETE

### Verification Tokens Table (`verification_tokens`)
- **Purpose**: Stores email verification tokens
- **RLS Policy**: Open access (needed for NextAuth.js)
- **Operations**: ALL (SELECT, INSERT, UPDATE, DELETE)

## 🔐 Security Features

### User Data Isolation
- Each user can only access their own data
- No cross-user data access is possible
- Prevents data leakage between users

### Service Role Access
- NextAuth.js service role can manage all data
- Required for authentication operations
- Separate from user-level access

### Admin Access (Optional)
- Commented out admin policies available
- Can be enabled for administrative functions
- Requires specific admin email configuration

## 🧪 Testing RLS Policies

### Test as Authenticated User
```sql
-- Should only return current user's data
SELECT * FROM users WHERE id = auth.uid()::text;
```

### Test as Service Role
```sql
-- Should return all data (for NextAuth operations)
SET LOCAL ROLE service_role;
SELECT * FROM users;
```

### Test as Anonymous User
```sql
-- Should return no data
SET LOCAL ROLE anon;
SELECT * FROM users;
```

## 🔍 Verification Queries

The RLS policies file includes several verification queries:

1. **Check RLS Status**: Verify RLS is enabled on all tables
2. **List Policies**: View all policies for each table
3. **Test Access**: Verify different user roles have appropriate access

## ⚠️ Important Notes

### NextAuth.js Compatibility
- Service role policies are essential for NextAuth.js
- Without these, authentication will fail
- Do not remove service role policies

### User ID Format
- Policies assume `auth.uid()` returns a string
- User IDs are converted to text for comparison
- Format: `auth.uid()::text = id`

### Verification Tokens
- Open access is required for NextAuth.js email verification
- This is safe as tokens are temporary and single-use
- Tokens expire automatically

## 🚀 Production Considerations

### Before Deploying
1. Test all policies thoroughly
2. Verify NextAuth.js functionality
3. Check user data isolation
4. Test service role operations

### Monitoring
- Monitor RLS policy performance
- Check for any access denied errors
- Verify user data remains isolated

### Backup
- Keep a backup of your RLS policies
- Document any custom modifications
- Test restore procedures

## 🛠️ Troubleshooting

### Common Issues

#### "Row Level Security" Error
- **Cause**: RLS is enabled but no policies exist
- **Solution**: Run the RLS policies SQL file

#### NextAuth.js Authentication Fails
- **Cause**: Service role policies missing
- **Solution**: Ensure service role policies are enabled

#### Users Can't Access Their Data
- **Cause**: User policies too restrictive
- **Solution**: Check user ID format and policy conditions

#### Performance Issues
- **Cause**: Complex policy conditions
- **Solution**: Optimize policy queries and add indexes

### Debug Steps

1. **Check RLS Status**:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables 
   WHERE tablename IN ('users', 'accounts', 'sessions', 'verification_tokens');
   ```

2. **List Active Policies**:
   ```sql
   SELECT tablename, policyname, cmd FROM pg_policies 
   WHERE tablename = 'users';
   ```

3. **Test User Context**:
   ```sql
   SELECT auth.uid(), auth.role();
   ```

## 📚 Additional Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [NextAuth.js Supabase Adapter](https://next-auth.js.org/providers/supabase)

## 🔄 Maintenance

### Regular Tasks
- Review and update policies as needed
- Monitor for security vulnerabilities
- Test policies after schema changes
- Update documentation for any changes

### Schema Changes
- Update RLS policies when adding new tables
- Test policies after modifying existing tables
- Ensure new columns don't break existing policies

---

**Note**: Always test RLS policies in a development environment before applying to production.
