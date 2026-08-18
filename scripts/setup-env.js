#!/usr/bin/env node

/**
 * Environment Setup Script
 * Helps create the .env.local file with required environment variables
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const envPath = path.join(process.cwd(), '.env.local');

// Generate a random secret for NextAuth
const generateSecret = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Hash a password using bcrypt
const hashPassword = async (password) => {
  const bcrypt = await import('bcryptjs');
  return await bcrypt.hash(password, 10);
};

const envContent = `# NextAuth Configuration
NEXTAUTH_SECRET=${generateSecret()}
NEXTAUTH_URL=http://localhost:3000

# Allowed User Credentials
# Change these to your desired credentials
ALLOWED_EMAIL=admin@cortex.com
ALLOWED_PASSWORD=CortexAdmin@25

# Database Configuration (Supabase)
# Replace with your actual Supabase credentials
DATABASE_URL=postgresql://username:password@localhost:5432/cortex
DIRECT_URL=postgresql://username:password@localhost:5432/cortex

# OpenAI Configuration
# Add your OpenAI API key here
OPENAI_API_KEY=your-openai-api-key-here
`;

console.log('🔧 Setting up environment variables...');

try {
  // Check if .env.local already exists
  if (fs.existsSync(envPath)) {
    console.log('⚠️  .env.local already exists. Backing up to .env.local.backup');
    fs.copyFileSync(envPath, envPath + '.backup');
  }

  // Write the new .env.local file
  fs.writeFileSync(envPath, envContent);
  
  console.log('✅ .env.local file created successfully!');
  console.log('');
  console.log('📝 Next steps:');
  console.log('1. Update the database URLs with your Supabase credentials');
  console.log('2. Add your OpenAI API key');
  console.log('3. Change the ALLOWED_EMAIL and ALLOWED_PASSWORD if needed');
  console.log('4. Run: npm run dev');
  console.log('');
  console.log('🔐 Default login credentials:');
  console.log('Email: admin@cortex.com');
  console.log('Password: admin123');
  
} catch (error) {
  console.error('❌ Error creating .env.local file:', error.message);
  process.exit(1);
}
