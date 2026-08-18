# Cortex

A modern Next.js application with AI integration, database management, and a comprehensive UI component library.

## 🚀 Features

- **🎨 Modern UI**: 42 shadcn/ui components with Tailwind CSS
- **🗄️ Database**: Prisma ORM with Supabase PostgreSQL support
- **🤖 AI Integration**: OpenAI service with flexible JSON/text responses
- **📊 Data Management**: User data table with actions and status management
- **📱 Responsive Design**: Mobile-first approach with modern UX
- **🔧 Developer Experience**: Hot reload, TypeScript support, ESLint

## 📚 Documentation

All documentation is organized in the `docs/` folder:

- **[📁 Project Structure](docs/DIRECTORY_STRUCTURE.md)** - Complete project structure and file organization
- **[🗄️ Database Setup](docs/DATABASE_SETUP.md)** - Database configuration and setup guide
- **[🔐 Authentication Setup](docs/AUTHENTICATION_SETUP.md)** - NextAuth.js authentication setup guide
- **[🔧 Services](docs/SERVICES_README.md)** - Services documentation (OpenAI, Database)
- **[📖 Documentation Index](docs/README.md)** - Complete documentation overview

## 🚀 Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Add your Supabase, OpenAI, and authentication credentials
   ```

3. **Set up the database**:
   ```bash
   npm run db:generate
   npm run db:push
   ```

4. **Set up authentication**:
   ```bash
   # Generate NextAuth secret
   openssl rand -base64 32
   # Hash your password
   node -e "console.log(require('bcryptjs').hashSync('your_password', 10))"
   ```

5. **Start development**:
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) to see the result.

## 🏗️ Architecture

### Frontend
- **Next.js 15.5.3** with App Router
- **React 19.1.0** with modern hooks
- **Tailwind CSS v4** for styling
- **shadcn/ui** for 42 pre-built components

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
- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

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
- `NEXTAUTH_SECRET` - NextAuth.js JWT secret
- `NEXTAUTH_URL` - NextAuth.js base URL
- `ALLOWED_EMAIL` - Single user email for authentication
- `ALLOWED_PASSWORD` - Single user password (hashed)

## 📁 Project Structure

```
cortex/
├── docs/                    # 📚 All documentation
├── prisma/                  # 🗄️ Database schema
├── public/                  # 🌐 Static assets
├── scripts/                 # 🔧 Build scripts
└── src/                     # 💻 Source code
    ├── app/                 # Next.js App Router
    ├── components/          # React components
    │   ├── auth/           # Authentication components
    │   ├── dashboard/       # Dashboard components
    │   ├── chat/           # Chat components
    │   ├── layout/         # Layout components
    │   └── ui/             # shadcn/ui components (42)
    ├── config/             # Configuration files
    ├── lib/                # Utility libraries
    └── services/           # Service modules
```

## 🤝 Contributing

When making changes:

1. **Update documentation** if structure changes
2. **Update `docs/DIRECTORY_STRUCTURE.md`** for any file/folder changes
3. **Test all functionality** before committing
4. **Follow naming conventions** for consistency

## 📖 Learn More

- [Next.js Documentation](https://nextjs.org/docs) - Next.js features and API
- [Prisma Documentation](https://www.prisma.io/docs) - Database ORM
- [Supabase Documentation](https://supabase.com/docs) - Backend as a Service
- [shadcn/ui Documentation](https://ui.shadcn.com) - UI components

## 🚀 Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
