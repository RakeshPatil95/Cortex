#!/usr/bin/env node

/**
 * Prisma Client Generation Script
 * Generates Prisma client with proper configuration
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🚀 Generating Prisma client...');

try {
  // Change to project root directory
  process.chdir(projectRoot);
  
  // Generate Prisma client
  execSync('npx prisma generate', { 
    stdio: 'inherit',
    cwd: projectRoot 
  });
  
  console.log('✅ Prisma client generated successfully!');
  console.log('📁 Client location: src/generated/prisma/');
  
} catch (error) {
  console.error('❌ Failed to generate Prisma client:', error.message);
  process.exit(1);
}
