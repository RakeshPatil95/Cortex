/**
 * Authentication Configuration
 * Handles NextAuth configuration and environment variables
 */

import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

const authOptions = {
  // NextAuth secret for JWT signing
  secret: process.env.NEXTAUTH_SECRET,
  
  // Session configuration
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  
  // Pages configuration
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },
  
  // Providers
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          // For now, use simple hardcoded credentials
          // In production, this should query the database
          const validCredentials = {
            email: process.env.ALLOWED_EMAIL || 'admin@example.com',
            password: process.env.ALLOWED_PASSWORD || 'admin123'
          };

          if (credentials.email === validCredentials.email && 
              credentials.password === validCredentials.password) {
            return {
              id: '1',
              email: credentials.email,
              name: 'Admin User',
              image: null,
            };
          }

          return null;
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      }
    })
  ],
  
  // Callbacks
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
      }
      return session;
    },
  },
};

export { authOptions };

export const authConfig = {
  // NextAuth secret for JWT signing
  secret: process.env.NEXTAUTH_SECRET,
  
  // Allowed user credentials (from environment)
  allowedEmail: process.env.ALLOWED_EMAIL,
  allowedPassword: process.env.ALLOWED_PASSWORD,
  
  // Session configuration
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  
  // Pages configuration
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },
  
  // Callbacks
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
      }
      return session;
    },
  },
};

/**
 * Validate authentication configuration
 * @returns {boolean} True if configuration is valid
 */
export function validateAuthConfig() {
  if (!authConfig.secret) {
    throw new Error('NEXTAUTH_SECRET is required');
  }
  
  if (!authConfig.allowedEmail) {
    throw new Error('ALLOWED_EMAIL is required');
  }
  
  if (!authConfig.allowedPassword) {
    throw new Error('ALLOWED_PASSWORD is required');
  }
  
  return true;
}

export default authConfig;
