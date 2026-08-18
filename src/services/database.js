/**
 * Database Service
 * Manages Prisma client with Supabase connection pooling and direct URL support
 */

import { PrismaClient } from '../generated/prisma';
import { getDatabaseConfig, validateDatabaseConfig } from '../config/database.js';

class DatabaseService {
  constructor() {
    this.prisma = null;
    this.isConnected = false;
    this.connectionType = null;
  }

  /**
   * Initialize database connection
   * @param {Object} options - Connection options
   * @param {boolean} options.useDirectUrl - Use direct URL instead of pooled connection
   * @param {boolean} options.forceReconnect - Force reconnection even if already connected
   * @returns {Promise<PrismaClient>} Prisma client instance
   */
  async connect(options = {}) {
    const { useDirectUrl = false, forceReconnect = false } = options;

    // Return existing connection if already connected and not forcing reconnect
    if (this.prisma && this.isConnected && !forceReconnect) {
      return this.prisma;
    }

    try {
      // Validate configuration
      validateDatabaseConfig();
      
      const dbConfig = getDatabaseConfig();
      
      // Choose connection URL based on options
      const connectionUrl = useDirectUrl ? dbConfig.directUrl : dbConfig.databaseUrl;
      this.connectionType = useDirectUrl ? 'direct' : 'pooled';

      // Create Prisma client with connection URL
      this.prisma = new PrismaClient({
        datasources: {
          db: {
            url: connectionUrl
          }
        },
        log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
      });

      // Test connection
      await this.prisma.$connect();
      this.isConnected = true;

      console.log(`✅ Database connected using ${this.connectionType} connection`);
      return this.prisma;

    } catch (error) {
      console.error('❌ Database connection failed:', error);
      this.isConnected = false;
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  /**
   * Get Prisma client instance
   * @param {Object} options - Connection options
   * @returns {Promise<PrismaClient>} Prisma client instance
   */
  async getClient(options = {}) {
    if (!this.prisma || !this.isConnected) {
      await this.connect(options);
    }
    return this.prisma;
  }

  /**
   * Disconnect from database
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.prisma) {
      try {
        await this.prisma.$disconnect();
        this.isConnected = false;
        this.connectionType = null;
        console.log('✅ Database disconnected');
      } catch (error) {
        console.error('❌ Error disconnecting from database:', error);
        throw error;
      }
    }
  }

  /**
   * Execute a database transaction
   * @param {Function} callback - Transaction callback function
   * @param {Object} options - Transaction options
   * @returns {Promise<any>} Transaction result
   */
  async transaction(callback, options = {}) {
    const client = await this.getClient();
    return client.$transaction(callback, options);
  }

  /**
   * Execute raw SQL query
   * @param {string} query - SQL query string
   * @param {Array} params - Query parameters
   * @returns {Promise<any>} Query result
   */
  async rawQuery(query, params = []) {
    const client = await this.getClient();
    return client.$queryRawUnsafe(query, ...params);
  }

  /**
   * Health check for database connection
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      const client = await this.getClient();
      await client.$queryRaw`SELECT 1`;
      
      return {
        status: 'healthy',
        connected: this.isConnected,
        connectionType: this.connectionType,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        connectionType: this.connectionType,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get connection information
   * @returns {Object} Connection information
   */
  getConnectionInfo() {
    return {
      connected: this.isConnected,
      connectionType: this.connectionType,
      prismaClient: !!this.prisma
    };
  }

  /**
   * Switch connection type
   * @param {boolean} useDirectUrl - Use direct URL
   * @returns {Promise<PrismaClient>} New Prisma client instance
   */
  async switchConnection(useDirectUrl = false) {
    await this.disconnect();
    return this.connect({ useDirectUrl, forceReconnect: true });
  }
}

// Create and export singleton instance
const databaseService = new DatabaseService();

export default databaseService;

// Also export the class for custom instances
export { DatabaseService };
