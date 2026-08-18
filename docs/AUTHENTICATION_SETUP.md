# Authentication Setup Guide

This guide will help you set up NextAuth.js with email/password authentication for your Cortex application.

## Prerequisites

- Node.js 18+ installed
- Database configured (see [DATABASE_SETUP.md](./DATABASE_SETUP.md))
- Environment variables configured

## Step 1: Environment Variables

Add the following environment variables to your `.env` file:

```bash
# NextAuth Configuration
NEXTAUTH_SECRET=your_nextauth_secret_here
NEXTAUTH_URL=http://localhost:3000

# Authentication Credentials (Single User)
ALLOWED_EMAIL=admin@example.com
ALLOWED_PASSWORD=your_hashed_password_here

# Database Configuration (already configured)
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
```

### Generate Required Values

1. **Generate NEXTAUTH_SECRET**:
   ```bash
   openssl rand -base64 32
   ```

2. **Hash your password**:
   ```bash
   node -e "console.log(require('bcryptjs').hashSync('your_password', 10))"
   ```

## Step 2: Database Setup

1. **Generate Prisma client**:
   ```bash
   npm run db:generate
   ```

2. **Push schema to database**:
   ```bash
   npm run db:push
   ```

## Step 3: Test Authentication

1. **Start the development server**:
   ```bash
   npm run dev
   ```

2. **Navigate to the application**:
   - Go to [http://localhost:3000](http://localhost:3000)
   - You should be redirected to the login page

3. **Login with your credentials**:
   - Use the email and password you set in `ALLOWED_EMAIL` and `ALLOWED_PASSWORD`
   - You should be redirected to the dashboard

## Authentication Features

### ✅ Single User Authentication
- Only one user can login (defined in environment variables)
- Email and password stored securely in environment
- Password hashed using bcrypt

### ✅ Session Management
- JWT-based sessions
- 30-day session duration
- Automatic session validation

### ✅ Route Protection
- Protected routes: `/dashboard`, `/chat`, `/forms`, `/settings`
- Automatic redirect to login for unauthenticated users
- Middleware-based protection

### ✅ User Interface
- Professional login page with form validation
- Responsive design with mobile support
- Password visibility toggle
- Loading states and error handling

## Project Structure

```
src/
├── app/
│   ├── api/auth/[...nextauth]/    # NextAuth API routes
│   ├── auth/login/                # Login page
│   ├── dashboard/                 # Protected dashboard
│   ├── chat/                      # Protected chat page
│   ├── forms/                     # Protected forms page
│   ├── settings/                  # Protected settings page
│   └── providers.js               # Session provider
├── components/layout/
│   ├── Sidebar.jsx               # Sidebar navigation
│   └── MainLayout.jsx            # Main layout wrapper
├── config/
│   └── auth.js                   # Authentication configuration
├── lib/
│   └── auth.js                   # NextAuth configuration
└── middleware.js                 # Route protection middleware
```

## Database Schema

The authentication system uses the following Prisma models:

### User Model
```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  password      String?   // For email/password auth
  accounts      Account[]
  sessions      Session[]
  posts         Post[]
}
```

### Session Model
```prisma
model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### Account Model
```prisma
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  // ... other OAuth fields
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

## Usage Examples

### Login Page
The login page is automatically displayed for unauthenticated users:
- Clean, professional design
- Form validation
- Error handling
- Loading states

### Dashboard
After successful login, users are redirected to the dashboard:
- Sidebar navigation
- User information display
- Quick actions
- System status

### Protected Routes
All protected routes automatically:
- Check authentication status
- Redirect to login if not authenticated
- Display loading state during check

## Security Features

### Password Security
- Passwords are hashed using bcrypt
- Salt rounds: 10
- No plain text password storage

### Session Security
- JWT tokens with secure secret
- Session expiration handling
- Automatic cleanup of expired sessions

### Route Protection
- Middleware-based protection
- Server-side session validation
- Automatic redirects

## Troubleshooting

### Common Issues

1. **"Authentication credentials not configured"**:
   - Check that `ALLOWED_EMAIL` and `ALLOWED_PASSWORD` are set
   - Verify password is properly hashed

2. **"Invalid email or password"**:
   - Verify the email matches `ALLOWED_EMAIL`
   - Check that the password is correctly hashed
   - Ensure bcrypt comparison is working

3. **Database connection errors**:
   - Verify database credentials
   - Check that Prisma client is generated
   - Ensure database schema is pushed

4. **Session not persisting**:
   - Check `NEXTAUTH_SECRET` is set
   - Verify `NEXTAUTH_URL` is correct
   - Check browser cookies are enabled

### Debug Steps

1. **Check environment variables**:
   ```bash
   echo $NEXTAUTH_SECRET
   echo $ALLOWED_EMAIL
   ```

2. **Verify database connection**:
   ```bash
   npm run db:studio
   ```

3. **Check browser console** for client-side errors

4. **Check server logs** for server-side errors

## Production Deployment

### Environment Variables
Set the following in your production environment:
- `NEXTAUTH_SECRET` - Generate a new secret for production
- `NEXTAUTH_URL` - Set to your production domain
- `ALLOWED_EMAIL` - Your production admin email
- `ALLOWED_PASSWORD` - Your production password (hashed)

### Security Considerations
- Use strong, unique passwords
- Rotate secrets regularly
- Use HTTPS in production
- Monitor authentication logs
- Consider rate limiting for login attempts

## Next Steps

1. **Customize the UI** to match your brand
2. **Add user management** if you need multiple users
3. **Implement OAuth providers** (Google, GitHub, etc.)
4. **Add two-factor authentication** for enhanced security
5. **Set up email verification** if needed

## Support

For issues with authentication:
1. Check this documentation
2. Review the [NextAuth.js documentation](https://next-auth.js.org/)
3. Check the [Prisma documentation](https://www.prisma.io/docs)
4. Review server and browser console logs
