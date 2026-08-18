import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import bcrypt from 'bcryptjs';
import { authConfig, validateAuthConfig } from '../config/auth.js';

const prisma = new PrismaClient();

// Validate configuration
validateAuthConfig();

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            return null;
          }

          // Check if the provided credentials match the allowed user
          if (credentials.email !== authConfig.allowedEmail) {
            return null;
          }

          // Find or create the user
          let user = await prisma.user.findUnique({
            where: { email: credentials.email }
          });

          if (!user) {
            // Create the user if they don't exist with hashed password
            const hashedPassword = await bcrypt.hash(authConfig.allowedPassword, 10);
            user = await prisma.user.create({
              data: {
                email: credentials.email,
                name: credentials.email.split('@')[0], // Use email prefix as name
                password: hashedPassword, // Store hashed password
              }
            });
          } else {
            // Update existing user's password to match current environment password
            const hashedPassword = await bcrypt.hash(authConfig.allowedPassword, 10);
            user = await prisma.user.update({
              where: { email: credentials.email },
              data: { password: hashedPassword }
            });
          }

          // Verify password against stored hash
          const isValidPassword = await bcrypt.compare(credentials.password, user.password);
          if (!isValidPassword) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
          };
        } catch (error) {
          console.error('Authentication error:', error);
          return null;
        }
      }
    })
  ],
  session: authConfig.session,
  callbacks: authConfig.callbacks,
  pages: authConfig.pages,
  secret: authConfig.secret,
};

export default NextAuth(authOptions);
