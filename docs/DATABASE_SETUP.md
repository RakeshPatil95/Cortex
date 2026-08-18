# Database Setup Guide

This guide will help you set up Prisma with Supabase for your Cortex application.

## Prerequisites

- Node.js 18+ installed
- A Supabase account and project
- Git (for version control)

## Step 1: Supabase Project Setup

1. **Create a Supabase project**:
   - Go to [supabase.com](https://supabase.com)
   - Sign up or log in
   - Click "New Project"
   - Choose your organization
   - Enter project name: `cortex`
   - Set a strong database password
   - Choose a region close to your users
   - Click "Create new project"

2. **Get your database credentials**:
   - Go to Settings → Database
   - Copy the connection string
   - Note your project reference ID

## Step 2: Environment Configuration

1. **Create environment file**:
   ```bash
   cp .env.example .env
   ```

2. **Update your `.env` file** with Supabase credentials:
   ```bash
   # Database Configuration
   DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres?pgbouncer=true&connection_limit=1"
   DIRECT_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"

   # Supabase Configuration
   NEXT_PUBLIC_SUPABASE_URL=https://[YOUR-PROJECT-REF].supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

   # OpenAI Configuration
   OPENAI_API_KEY=your_openai_api_key_here

   # Environment
   NODE_ENV=development
   ```

3. **Replace placeholders**:
   - `[YOUR-PASSWORD]`: Your database password
   - `[YOUR-PROJECT-REF]`: Your Supabase project reference
   - `your_supabase_anon_key_here`: From Supabase Settings → API
   - `your_supabase_service_role_key_here`: From Supabase Settings → API
   - `your_openai_api_key_here`: Your OpenAI API key

## Step 3: Database Setup

1. **Generate Prisma client**:
   ```bash
   npm run db:generate
   ```

2. **Push schema to database**:
   ```bash
   npm run db:push
   ```


## Step 4: Verify Setup

1. **Test database connection**:
   ```bash
   npm run db:studio
   ```
   This opens Prisma Studio where you can view and manage your data.

2. **Run the application**:
   ```bash
   npm run dev
   ```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema changes to database |
| `npm run db:migrate` | Create and run migrations |
| `npm run db:migrate:deploy` | Deploy migrations (production) |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:reset` | Reset database and run migrations |

## Connection Types

### Pooled Connection (Default)
- **URL**: Uses `DATABASE_URL` with `pgbouncer=true`
- **Use case**: Production applications, high-traffic scenarios
- **Benefits**: Better performance, connection reuse, resource efficiency

### Direct Connection
- **URL**: Uses `DIRECT_URL` without pooling
- **Use case**: Migrations, schema operations, admin tasks
- **Benefits**: Full database access, no connection limits

## Usage Examples

### Basic Database Operations

```javascript
import { databaseService } from '@/services';

// Connect to database
const prisma = await databaseService.connect();

// Create a user
const user = await prisma.user.create({
  data: {
    email: 'user@example.com',
    name: 'User Name'
  }
});

// Find users
const users = await prisma.user.findMany();

// Create a post
const post = await prisma.post.create({
  data: {
    title: 'My Post',
    content: 'Post content',
    published: true,
    authorId: user.id
  }
});
```

### Connection Switching

```javascript
// Use pooled connection (default)
const prisma = await databaseService.connect();

// Switch to direct connection for migrations
await databaseService.switchConnection(true);

// Switch back to pooled connection
await databaseService.switchConnection(false);
```

### Health Monitoring

```javascript
// Check database health
const health = await databaseService.healthCheck();
console.log('Database status:', health.status);

// Get connection info
const info = databaseService.getConnectionInfo();
console.log('Connection type:', info.connectionType);
```

## Troubleshooting

### Common Issues

1. **Connection refused**:
   - Check your `DATABASE_URL` and `DIRECT_URL`
   - Verify your Supabase project is running
   - Ensure your IP is whitelisted in Supabase

2. **Schema validation errors**:
   - Run `npm run db:generate` to regenerate the client
   - Check your Prisma schema for syntax errors

3. **Migration errors**:
   - Use `npm run db:push` for development
   - Use `npm run db:migrate` for production migrations

4. **Permission errors**:
   - Check your database password
   - Verify your Supabase service role key

### Getting Help

- Check the [Prisma documentation](https://www.prisma.io/docs)
- Check the [Supabase documentation](https://supabase.com/docs)
- Review the service documentation in `src/services/README.md`

## Production Deployment

1. **Set up production environment variables** in your deployment platform
2. **Use connection pooling** for better performance
3. **Run migrations** before deploying:
   ```bash
   npm run db:migrate:deploy
   ```
4. **Monitor database health** using the built-in health checks

## Security Best Practices

1. **Never commit** your `.env` file
2. **Use strong passwords** for your database
3. **Rotate API keys** regularly
4. **Use connection pooling** in production
5. **Monitor database access** and set up alerts
