/**
 * Database Configuration
 * Handles both Supabase pooling and direct URL connections
 */

const config = {
  development: {
    // Local development database
    databaseUrl: process.env.DATABASE_URL || 'postgresql://username:password@localhost:5432/cortex_dev',
    directUrl: process.env.DIRECT_URL || 'postgresql://username:password@localhost:5432/cortex_dev',
    connectionLimit: 1,
    poolTimeout: 20,
    connectionTimeout: 60,
  },
  
  production: {
    // Supabase production configuration
    databaseUrl: process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL,
    connectionLimit: 1,
    poolTimeout: 20,
    connectionTimeout: 60,
  },
  
  test: {
    // Test database configuration
    databaseUrl: process.env.TEST_DATABASE_URL || 'postgresql://username:password@localhost:5432/cortex_test',
    directUrl: process.env.TEST_DIRECT_URL || 'postgresql://username:password@localhost:5432/cortex_test',
    connectionLimit: 1,
    poolTimeout: 20,
    connectionTimeout: 60,
  }
};

/**
 * Get database configuration for current environment
 * @returns {Object} Database configuration
 */
export function getDatabaseConfig() {
  const env = process.env.NODE_ENV || 'development';
  return config[env] || config.development;
}

/**
 * Validate database configuration
 * @returns {boolean} True if configuration is valid
 */
export function validateDatabaseConfig() {
  const dbConfig = getDatabaseConfig();
  
  if (!dbConfig.databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  
  if (!dbConfig.directUrl) {
    throw new Error('DIRECT_URL is required');
  }
  
  return true;
}

/**
 * Get Supabase connection URLs
 * @param {string} projectRef - Supabase project reference
 * @param {string} password - Database password
 * @returns {Object} Connection URLs
 */
export function getSupabaseUrls(projectRef, password) {
  const baseUrl = `postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`;
  
  return {
    // Pooled connection (recommended for production)
    pooled: `${baseUrl}?pgbouncer=true&connection_limit=1`,
    // Direct connection (for migrations and schema operations)
    direct: baseUrl
  };
}

export default config;
