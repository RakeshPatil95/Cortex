# Services

This directory contains all the service modules for the Cortex application.

## Structure

```
services/
├── openai.js              # OpenAI service with JSON/text response support
├── database.js            # Database service with Supabase connection management
├── config.js              # Service configuration
├── index.js               # Centralized exports
└── README.md              # This file
```

## Database Service

The database service provides a comprehensive interface for managing Prisma connections with Supabase, supporting both connection pooling and direct URL connections.

### Features

- ✅ **Supabase Integration** - Full support for Supabase PostgreSQL
- ✅ **Connection Pooling** - Optimized for production workloads
- ✅ **Direct URL Support** - For migrations and schema operations
- ✅ **Connection Switching** - Switch between pooled and direct connections
- ✅ **Health Monitoring** - Built-in health checks and monitoring
- ✅ **Transaction Support** - Full transaction management
- ✅ **Raw SQL Support** - Execute raw SQL queries
- ✅ **Error Handling** - Comprehensive error handling and reconnection
- ✅ **Environment Support** - Works in development, production, and test

### Configuration

#### Environment Variables

Create a `.env` file in your project root:

```bash
# Database Configuration
# Supabase Database URLs

# For connection pooling (recommended for production)
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres?pgbouncer=true&connection_limit=1"

# For direct connections (used for migrations and schema operations)
DIRECT_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"

# Local Development (if using local PostgreSQL)
# DATABASE_URL="postgresql://username:password@localhost:5432/cortex_dev"
# DIRECT_URL="postgresql://username:password@localhost:5432/cortex_dev"

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://[YOUR-PROJECT-REF].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Environment
NODE_ENV=development
```

#### Supabase Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com)
2. **Get your database credentials** from the project settings
3. **Update your environment variables** with the correct URLs
4. **Run migrations** to set up your database schema

### Usage

#### Basic Connection

```javascript
import { databaseService } from '@/services';

// Connect to database (uses pooled connection by default)
const prisma = await databaseService.connect();

// Use Prisma client
const users = await prisma.user.findMany();
```

#### Direct Connection (for migrations)

```javascript
// Connect using direct URL
const prisma = await databaseService.connect({ useDirectUrl: true });

// Execute migrations or schema operations
await prisma.$executeRaw`CREATE INDEX idx_user_email ON users(email)`;
```

#### Connection Switching

```javascript
// Switch to direct connection
await databaseService.switchConnection(true);

// Switch back to pooled connection
await databaseService.switchConnection(false);
```

#### Transactions

```javascript
const result = await databaseService.transaction(async (tx) => {
  const user = await tx.user.create({
    data: { email: 'user@example.com', name: 'User' }
  });
  
  const post = await tx.post.create({
    data: { title: 'My Post', authorId: user.id }
  });
  
  return { user, post };
});
```

#### Health Monitoring

```javascript
// Check database health
const health = await databaseService.healthCheck();
console.log('Database status:', health.status);

// Get connection information
const info = databaseService.getConnectionInfo();
console.log('Connection type:', info.connectionType);
```

### Database Scripts

The following npm scripts are available for database management:

```bash
# Generate Prisma client
npm run db:generate

# Push schema changes to database
npm run db:push

# Create and run migrations
npm run db:migrate

# Deploy migrations (production)
npm run db:migrate:deploy

# Open Prisma Studio
npm run db:studio

# Reset database
npm run db:reset
```

### Prisma Schema

The database schema includes example models:

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users")
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String?
  published Boolean  @default(false)
  authorId  String
  author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("posts")
}
```

### Connection Types

#### Pooled Connection (Default)
- **Use case**: Production applications, high-traffic scenarios
- **Benefits**: Better performance, connection reuse, resource efficiency
- **Configuration**: Uses `DATABASE_URL` with `pgbouncer=true`

#### Direct Connection
- **Use case**: Migrations, schema operations, admin tasks
- **Benefits**: Full database access, no connection limits
- **Configuration**: Uses `DIRECT_URL` without pooling

### Error Handling

The service includes comprehensive error handling:

```javascript
try {
  const prisma = await databaseService.connect();
  const users = await prisma.user.findMany();
} catch (error) {
  console.error('Database error:', error.message);
  
  // Check if reconnection is needed
  const health = await databaseService.healthCheck();
  if (health.status === 'unhealthy') {
    await databaseService.disconnect();
    await databaseService.connect();
  }
}
```


## OpenAI Service

The OpenAI service provides a reusable interface for interacting with OpenAI's API with the following features:

### Features

- ✅ **JSON Response Support** (default) - Get structured JSON responses
- ✅ **Plain Text Response** - Get raw text responses
- ✅ **Easy Model Switching** - Switch between different GPT models
- ✅ **GPT-5 Default** - Uses GPT-5 as the default model
- ✅ **Error Handling** - Comprehensive error handling
- ✅ **Configurable Parameters** - Temperature, max tokens, system messages
- ✅ **TypeScript Ready** - Full type support

### Available Models

- `gpt-5` (default)
- `gpt-4o`
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`

### Usage

#### Basic JSON Response (Default)

```javascript
import { openaiService } from '@/services';

const response = await openaiService.getJSONResponse(
  "Create a user profile with name, email, and age. Return as JSON."
);
// Returns: { name: "...", email: "...", age: ... }
```

#### Plain Text Response

```javascript
const response = await openaiService.getTextResponse(
  "Explain the benefits of React."
);
// Returns: "React is a powerful JavaScript library..."
```

#### Custom Configuration

```javascript
const response = await openaiService.getResponse(prompt, {
  model: 'gpt-4o',
  jsonResponse: false,
  temperature: 0.5,
  maxTokens: 500,
  systemMessage: "You are a helpful assistant."
});
```

#### Model Management

```javascript
// Get available models
const models = openaiService.getAvailableModels();

// Set default model
openaiService.setDefaultModel('gpt-4o');

// Get current default model
const currentModel = openaiService.getDefaultModel();
```

### Environment Setup

1. Add your OpenAI API key to your environment variables:
   ```bash
   OPENAI_API_KEY=your_api_key_here
   ```

2. Import and use the service:
   ```javascript
   import { openaiService } from '@/services';
   ```

### Error Handling

The service includes comprehensive error handling:

```javascript
try {
  const response = await openaiService.getJSONResponse(prompt);
  // Handle success
} catch (error) {
  console.error('OpenAI Error:', error.message);
  // Handle error
}
```
