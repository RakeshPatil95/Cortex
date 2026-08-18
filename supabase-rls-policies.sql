-- =====================================================
-- Supabase RLS (Row Level Security) Policies
-- =====================================================
-- This file contains RLS policies for all tables in the Cortex project
-- Run these SQL commands in your Supabase SQL editor to enable RLS

-- =====================================================
-- Enable RLS on all tables
-- =====================================================

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Enable RLS on accounts table
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- Enable RLS on sessions table
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Enable RLS on verification_tokens table
ALTER TABLE verification_tokens ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- USERS TABLE POLICIES
-- =====================================================

-- Policy: Users can only view their own data
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid()::text = id);

-- Policy: Users can update their own data
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid()::text = id);

-- Policy: Users can insert their own data (for registration)
CREATE POLICY "Users can insert own profile" ON users
    FOR INSERT WITH CHECK (auth.uid()::text = id);

-- Policy: Users can delete their own data
CREATE POLICY "Users can delete own profile" ON users
    FOR DELETE USING (auth.uid()::text = id);

-- =====================================================
-- ACCOUNTS TABLE POLICIES
-- =====================================================

-- Policy: Users can only view their own accounts
CREATE POLICY "Users can view own accounts" ON accounts
    FOR SELECT USING (auth.uid()::text = "userId");

-- Policy: Users can insert their own accounts
CREATE POLICY "Users can insert own accounts" ON accounts
    FOR INSERT WITH CHECK (auth.uid()::text = "userId");

-- Policy: Users can update their own accounts
CREATE POLICY "Users can update own accounts" ON accounts
    FOR UPDATE USING (auth.uid()::text = "userId");

-- Policy: Users can delete their own accounts
CREATE POLICY "Users can delete own accounts" ON accounts
    FOR DELETE USING (auth.uid()::text = "userId");

-- =====================================================
-- SESSIONS TABLE POLICIES
-- =====================================================

-- Policy: Users can only view their own sessions
CREATE POLICY "Users can view own sessions" ON sessions
    FOR SELECT USING (auth.uid()::text = "userId");

-- Policy: Users can insert their own sessions
CREATE POLICY "Users can insert own sessions" ON sessions
    FOR INSERT WITH CHECK (auth.uid()::text = "userId");

-- Policy: Users can update their own sessions
CREATE POLICY "Users can update own sessions" ON sessions
    FOR UPDATE USING (auth.uid()::text = "userId");

-- Policy: Users can delete their own sessions
CREATE POLICY "Users can delete own sessions" ON sessions
    FOR DELETE USING (auth.uid()::text = "userId");

-- =====================================================
-- VERIFICATION_TOKENS TABLE POLICIES
-- =====================================================

-- Policy: Allow all operations on verification tokens (used by NextAuth)
-- This is needed because NextAuth needs to create/read/delete tokens
-- without being tied to a specific user session
CREATE POLICY "Allow all operations on verification_tokens" ON verification_tokens
    FOR ALL USING (true);

-- =====================================================
-- SERVICE ROLE POLICIES (for NextAuth operations)
-- =====================================================

-- Grant necessary permissions to service role for NextAuth operations
-- These policies allow the service role to perform operations needed by NextAuth

-- Service role can manage users (for user creation during auth)
CREATE POLICY "Service role can manage users" ON users
    FOR ALL USING (auth.role() = 'service_role');

-- Service role can manage accounts (for OAuth account linking)
CREATE POLICY "Service role can manage accounts" ON accounts
    FOR ALL USING (auth.role() = 'service_role');

-- Service role can manage sessions (for session management)
CREATE POLICY "Service role can manage sessions" ON sessions
    FOR ALL USING (auth.role() = 'service_role');

-- Service role can manage verification tokens (for email verification)
CREATE POLICY "Service role can manage verification_tokens" ON verification_tokens
    FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- ADMIN POLICIES (if you have admin users)
-- =====================================================

-- Optional: Create admin policies if you have admin users
-- Uncomment and modify these if you need admin access

-- CREATE POLICY "Admins can view all users" ON users
--     FOR SELECT USING (
--         EXISTS (
--             SELECT 1 FROM users 
--             WHERE id = auth.uid()::text 
--             AND email = 'admin@cortex.com'
--         )
--     );

-- CREATE POLICY "Admins can update all users" ON users
--     FOR UPDATE USING (
--         EXISTS (
--             SELECT 1 FROM users 
--             WHERE id = auth.uid()::text 
--             AND email = 'admin@cortex.com'
--         )
--     );

-- =====================================================
-- HELPER FUNCTIONS (Optional)
-- =====================================================

-- Function to check if current user is admin
-- Uncomment if you need admin functionality
-- CREATE OR REPLACE FUNCTION is_admin()
-- RETURNS BOOLEAN AS $$
-- BEGIN
--     RETURN EXISTS (
--         SELECT 1 FROM users 
--         WHERE id = auth.uid()::text 
--         AND email = 'admin@cortex.com'
--     );
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Run these queries to verify RLS is working correctly

-- Check if RLS is enabled on all tables
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('users', 'accounts', 'sessions', 'verification_tokens')
ORDER BY tablename;

-- Check all policies on users table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'users'
ORDER BY policyname;

-- Check all policies on accounts table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'accounts'
ORDER BY policyname;

-- Check all policies on sessions table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'sessions'
ORDER BY policyname;

-- Check all policies on verification_tokens table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'verification_tokens'
ORDER BY policyname;

-- =====================================================
-- NOTES
-- =====================================================

-- 1. These policies assume you're using Supabase Auth with auth.uid()
-- 2. The service role policies are necessary for NextAuth.js to work properly
-- 3. All user data is isolated - users can only access their own records
-- 4. Verification tokens are accessible to all authenticated users (needed for NextAuth)
-- 5. Admin policies are commented out but can be enabled if needed
-- 6. Make sure to run these policies in your Supabase SQL editor
-- 7. Test the policies thoroughly before deploying to production

-- =====================================================
-- TESTING RLS POLICIES
-- =====================================================

-- To test RLS policies, you can run these queries as different users:

-- 1. Test as authenticated user (should only see own data):
-- SELECT * FROM users WHERE id = auth.uid()::text;

-- 2. Test as service role (should see all data):
-- SET LOCAL ROLE service_role;
-- SELECT * FROM users;

-- 3. Test as anonymous user (should see no data):
-- SET LOCAL ROLE anon;
-- SELECT * FROM users;
