# Cortex Documentation

Welcome to the Cortex project documentation. This directory contains all the documentation for the project.

## 📚 Documentation Index

### 🏗️ Project Structure
- **[DIRECTORY_STRUCTURE.md](./DIRECTORY_STRUCTURE.md)** - Complete project structure and file organization
  - Root directory overview
  - Source code structure
  - Component organization
  - Database structure
  - Available scripts
  - Dependencies and configuration

### 🗄️ Database
- **[DATABASE_SETUP.md](./DATABASE_SETUP.md)** - Database setup and configuration guide
  - Supabase project setup
  - Environment configuration
  - Prisma schema management
  - Connection types (pooled vs direct)
  - Troubleshooting guide

### 🔒 Security
- **[SUPABASE_RLS_SETUP.md](./SUPABASE_RLS_SETUP.md)** - Row Level Security setup guide
  - RLS policies for all tables
  - User data isolation
  - Service role permissions
  - Testing and verification
  - Production considerations

### 🔧 Services
- **[SERVICES_README.md](./SERVICES_README.md)** - Services documentation
  - Database service with Supabase support
  - OpenAI service with JSON/text responses
  - Configuration management
  - Usage examples and best practices

## 🚀 Quick Start

1. **Set up the project**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   - Copy `.env.example` to `.env`
   - Add your Supabase and OpenAI credentials

3. **Set up the database**:
   ```bash
   npm run db:generate
   npm run db:push
   ```

4. **Start development**:
   ```bash
   npm run dev
   ```

## 📁 Project Overview

Cortex is a Next.js application with the following key features:

- **🎨 Modern UI**: 42 shadcn/ui components with Tailwind CSS
- **🗄️ Database**: Prisma ORM with Supabase PostgreSQL
- **🤖 AI Integration**: OpenAI service with flexible response types
- **📱 Responsive Design**: Mobile-first approach
- **🔧 Developer Experience**: Hot reload, TypeScript support, ESLint

## 🏗️ Architecture

### Frontend
- **Next.js 15.5.3** with App Router
- **React 19.1.0** with modern hooks
- **Tailwind CSS v4** for styling
- **shadcn/ui** for components

### Backend
- **Prisma ORM** for database management
- **Supabase** for PostgreSQL hosting
- **OpenAI API** for AI features

### Development
- **Turbopack** for fast bundling
- **ESLint** for code quality
- **Hot reload** for development

## 📋 Available Scripts

### Development
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run code linting

### Database
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema to database
- `npm run db:migrate` - Run migrations
- `npm run db:studio` - Open Prisma Studio

## 🔧 Configuration

### Environment Variables
- `DATABASE_URL` - Supabase pooled connection
- `DIRECT_URL` - Supabase direct connection
- `OPENAI_API_KEY` - OpenAI API key
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key

### Database Configuration
- Connection pooling for production
- Direct connections for migrations
- Environment-specific settings
- Health monitoring

## 📖 Getting Help

1. **Check the documentation** in this folder
2. **Review the project structure** in `DIRECTORY_STRUCTURE.md`
3. **Follow the setup guide** in `DATABASE_SETUP.md`
4. **Check service documentation** in `SERVICES_README.md`

## 🤝 Contributing

When making changes to the project:

1. **Update documentation** if structure changes
2. **Update `DIRECTORY_STRUCTURE.md`** for any file/folder changes
3. **Test all functionality** before committing
4. **Follow naming conventions** for consistency

## 📝 Documentation Maintenance

This documentation is maintained alongside the codebase. When making structural changes:

1. Update `DIRECTORY_STRUCTURE.md` with new files/folders
2. Update relevant documentation files
3. Update this README if needed
4. Test all documentation links

---

**Last Updated**: 2024-09-28  
**Version**: 1.0.0
