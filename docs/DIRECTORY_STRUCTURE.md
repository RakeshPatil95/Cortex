# Cortex Project Directory Structure

This document provides a comprehensive overview of the Cortex project's directory structure and file organization. This file is updated whenever the project structure changes.

## 📁 Root Directory

```
cortex/
├── docs/                           # 📚 Documentation
│   ├── DIRECTORY_STRUCTURE.md     # This file - project structure overview
│   ├── DATABASE_SETUP.md          # Database setup and configuration guide
│   ├── AUTHENTICATION_SETUP.md    # NextAuth.js authentication setup guide
│   └── SERVICES_README.md         # Services documentation (OpenAI, Database)
├── prisma/                         # 🗄️ Database schema and migrations
│   └── schema.prisma              # Prisma database schema
├── supabase-rls-policies.sql      # 🔒 Supabase RLS policies for security
├── public/                         # 🌐 Static assets
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── scripts/                        # 🔧 Build and utility scripts
│   └── generate-prisma.js         # Prisma client generation script
├── src/                           # 💻 Source code
│   ├── app/                       # Next.js App Router
│   ├── components/                # React components
│   ├── config/                    # Configuration files
│   ├── lib/                       # Utility libraries
│   └── services/                  # Service modules
├── .env.example                   # Environment variables template
├── middleware.js                  # NextAuth.js route protection middleware
├── components.json                # shadcn/ui configuration
├── DATABASE_SETUP.md             # [MOVED TO docs/] Database setup guide
├── eslint.config.mjs             # ESLint configuration
├── jsconfig.json                 # JavaScript configuration
├── next.config.mjs               # Next.js configuration
├── package.json                  # Dependencies and scripts
├── package-lock.json             # Dependency lock file
├── postcss.config.mjs            # PostCSS configuration
└── README.md                     # Project overview
```

## 📱 Source Code Structure (`src/`)

### App Router (`src/app/`)
```
app/
├── [lang]/                       # 🌐 Internationalized routes
│   ├── layout.js                 # Locale-specific layout
│   ├── page.js                   # Home page (redirects to dashboard)
│   ├── auth/login/               # 🔑 Authentication pages
│   │   └── page.js               # Login page component
│   ├── dashboard/                # 📊 Protected dashboard pages
│   │   └── page.js               # Dashboard main page
│   ├── cases/                    # ⚖️ Legal case management pages
│   │   ├── page.js               # Cases list page
│   │   ├── create/               # Case creation
│   │   │   └── page.js           # Create case page
│   │   └── edit/[id]/            # Case editing
│   │       └── page.js           # Edit case page
│   ├── chat/                     # 💬 Protected chat pages
│   │   └── page.js               # Chat page component
│   └── search/                   # 🔍 Search pages
│       └── page.js               # Search page component
├── api/auth/[...nextauth]/       # 🔐 NextAuth.js API routes
│   └── route.js                  # NextAuth API handler
├── favicon.ico                   # Site favicon
├── globals.css                   # Global styles with shadcn/ui variables
└── providers.js                  # NextAuth SessionProvider wrapper
```

### Components (`src/components/`)
```
components/
├── auth/                        # 🔐 Authentication components
│   ├── index.js                 # Auth component exports
│   └── LoginForm.jsx            # Login form component
├── cases/                       # ⚖️ Legal case management components
│   ├── index.js                 # Cases component exports
│   ├── CaseForm.jsx             # Case creation/editing form
│   └── CaseTable.jsx            # Cases data table
├── common/                      # 🔧 Common/shared components
│   ├── index.js                 # Common component exports
│   └── LoadingSpinner.jsx       # Loading spinner component
├── dashboard/                   # 📊 Dashboard-specific components
│   ├── index.js                 # Dashboard component exports
│   ├── DashboardContent.jsx     # Main dashboard content
│   ├── RecentActivity.jsx       # Recent activity feed
│   ├── QuickActions.jsx         # Quick action buttons
│   └── SystemStatus.jsx         # System status indicators
├── chat/                        # 💬 Chat-related components
│   ├── index.js                 # Chat component exports
│   └── ChatContent.jsx          # Chat interface component
├── layout/                      # 🏗️ Layout components
│   ├── index.js                 # Layout component exports
│   ├── Sidebar.jsx              # Sidebar navigation component
│   └── MainLayout.jsx           # Main layout wrapper with auth
└── ui/                          # 🎨 shadcn/ui components (42 components)
    ├── accordion.jsx            # Collapsible content component
    ├── alert-dialog.jsx         # Modal alert component
    ├── alert.jsx                # Alert notification component
    ├── aspect-ratio.jsx         # Aspect ratio container
    ├── avatar.jsx               # User avatar component
    ├── badge.jsx                # Status badge component
    ├── breadcrumb.jsx           # Navigation breadcrumb
    ├── button.jsx               # Button component
    ├── calendar.jsx             # Date picker calendar
    ├── card.jsx                 # Card container component
    ├── carousel.jsx             # Image/content carousel
    ├── checkbox.jsx             # Checkbox input component
    ├── collapsible.jsx          # Collapsible content
    ├── command.jsx              # Command palette component
    ├── context-menu.jsx         # Right-click context menu
    ├── dialog.jsx               # Modal dialog component
    ├── drawer.jsx               # Slide-out drawer component
    ├── dropdown-menu.jsx        # Dropdown menu component
    ├── form.jsx                 # Form wrapper component
    ├── hover-card.jsx           # Hover card component
    ├── input.jsx                # Text input component
    ├── label.jsx                # Form label component
    ├── menubar.jsx              # Menu bar component
    ├── navigation-menu.jsx      # Navigation menu component
    ├── pagination.jsx           # Pagination component
    ├── popover.jsx              # Popover component
    ├── progress.jsx             # Progress bar component
    ├── radio-group.jsx          # Radio button group
    ├── resizable.jsx            # Resizable panel component
    ├── scroll-area.jsx          # Custom scroll area
    ├── select.jsx               # Select dropdown component
    ├── separator.jsx            # Visual separator component
    ├── sheet.jsx                # Slide-out sheet component
    ├── skeleton.jsx             # Loading skeleton component
    ├── slider.jsx               # Range slider component
    ├── sonner.jsx               # Toast notification component
    ├── switch.jsx               # Toggle switch component
    ├── table.jsx                # Data table component
    ├── tabs.jsx                 # Tab navigation component
    ├── textarea.jsx             # Multi-line text input
    ├── toggle-group.jsx         # Toggle button group
    ├── toggle.jsx               # Toggle button component
    └── tooltip.jsx              # Tooltip component
```

### Configuration (`src/config/`)
```
config/
├── auth.js                      # Authentication configuration
└── database.js                  # Database configuration and environment setup
```

### Generated Code (`src/generated/`)
```
generated/
└── prisma/                      # Generated Prisma client
    ├── index.js                 # Prisma client exports
    ├── client.js                # Prisma client implementation
    └── ...                      # Other generated files
```

### Libraries (`src/lib/`)
```
lib/
├── auth.js                      # NextAuth.js configuration
└── utils.js                     # Utility functions (cn helper for class merging)
```

### Services (`src/services/`)
```
services/
├── config.js                    # Service configuration
├── database.js                  # Database service with Supabase support
├── index.js                     # Centralized service exports
└── openai.js                    # OpenAI service with JSON/text response support
```

## 🗄️ Database Structure (`prisma/`)

```
prisma/
└── schema.prisma                # Prisma database schema
    ├── Generator configuration  # Prisma client generation settings
    ├── Datasource configuration # PostgreSQL with Supabase support
    ├── User model              # User entity with authentication fields
    ├── Account model           # NextAuth account linking
    ├── Session model           # NextAuth session management
    ├── VerificationToken model # NextAuth email verification
    ├── LegalCase model         # Legal case entity with all required fields
    └── CaseDocument model      # Case document attachments
```

## 🔒 Security Configuration

```
supabase-rls-policies.sql       # Supabase RLS policies
    ├── Users table policies    # User data access control
    ├── Accounts table policies # OAuth account access control
    ├── Sessions table policies # Session management access control
    ├── Verification tokens     # Email verification access control
    ├── Service role policies   # NextAuth service permissions
    └── Admin policies          # Optional admin access control
```

## 🔧 Scripts (`scripts/`)

```
scripts/
└── generate-prisma.js           # Prisma client generation script
```

## 📚 Documentation (`docs/`)

```
docs/
├── DIRECTORY_STRUCTURE.md       # This file - complete project structure
├── DATABASE_SETUP.md           # Database setup and configuration guide
└── SERVICES_README.md          # Services documentation (OpenAI, Database)
```

## 🎨 UI Components (shadcn/ui)

The project includes 42 shadcn/ui components organized by functionality:

### Layout & Navigation
- `accordion.jsx` - Collapsible content sections
- `breadcrumb.jsx` - Navigation breadcrumbs
- `navigation-menu.jsx` - Main navigation menu
- `menubar.jsx` - Menu bar component
- `tabs.jsx` - Tab navigation
- `pagination.jsx` - Data pagination

### Data Display
- `avatar.jsx` - User avatars
- `badge.jsx` - Status badges
- `card.jsx` - Content cards
- `table.jsx` - Data tables
- `skeleton.jsx` - Loading skeletons
- `aspect-ratio.jsx` - Aspect ratio containers

### Forms & Inputs
- `button.jsx` - Various button styles
- `input.jsx` - Text inputs
- `textarea.jsx` - Multi-line inputs
- `checkbox.jsx` - Checkbox inputs
- `radio-group.jsx` - Radio button groups
- `select.jsx` - Dropdown selects
- `switch.jsx` - Toggle switches
- `slider.jsx` - Range sliders
- `form.jsx` - Form wrapper
- `label.jsx` - Form labels

### Feedback & Overlays
- `alert.jsx` - Alert notifications
- `alert-dialog.jsx` - Modal alerts
- `dialog.jsx` - Modal dialogs
- `drawer.jsx` - Slide-out drawers
- `sheet.jsx` - Slide-out sheets
- `popover.jsx` - Popover overlays
- `tooltip.jsx` - Tooltips
- `hover-card.jsx` - Hover cards
- `sonner.jsx` - Toast notifications
- `progress.jsx` - Progress indicators

### Interactive Components
- `command.jsx` - Command palette
- `context-menu.jsx` - Right-click menus
- `dropdown-menu.jsx` - Dropdown menus
- `toggle.jsx` - Toggle buttons
- `toggle-group.jsx` - Toggle groups
- `carousel.jsx` - Image carousels
- `calendar.jsx` - Date pickers
- `collapsible.jsx` - Collapsible content
- `resizable.jsx` - Resizable panels
- `scroll-area.jsx` - Custom scroll areas
- `separator.jsx` - Visual separators

## 🚀 Available Scripts

### Development
- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production with Turbopack
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Database
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Create and run migrations
- `npm run db:migrate:deploy` - Deploy migrations (production)
- `npm run db:studio` - Open Prisma Studio
- `npm run db:reset` - Reset database and run migrations

## 🔧 Configuration Files

### Core Configuration
- `next.config.mjs` - Next.js configuration
- `jsconfig.json` - JavaScript/TypeScript configuration
- `eslint.config.mjs` - ESLint configuration
- `postcss.config.mjs` - PostCSS configuration
- `tailwindcss` - Tailwind CSS configuration (v4)

### Component Configuration
- `components.json` - shadcn/ui configuration

### Package Management
- `package.json` - Dependencies and scripts
- `package-lock.json` - Dependency lock file

## 📦 Dependencies

### Core Framework
- **Next.js 15.5.3** - React framework with App Router
- **React 19.1.0** - UI library
- **Tailwind CSS v4** - Utility-first CSS framework

### Database & ORM
- **Prisma 6.16.2** - Database ORM
- **@prisma/client** - Prisma client

### UI Components
- **shadcn/ui** - 42 pre-built components
- **Radix UI** - Headless UI primitives
- **Lucide React** - Icon library

### Services
- **OpenAI 5.23.1** - AI service integration

### Development Tools
- **ESLint** - Code linting
- **Turbopack** - Fast bundler

## 🏗️ Architecture Patterns

### Server-Side vs Client-Side Code Separation
- **Pages**: Contain only server-side code and component imports
- **Components**: All client-side logic and interactivity
- **Clean separation** between server and client concerns
- **Better performance** with proper code splitting

### Modular Component Organization
- Components organized by feature (auth, dashboard, chat)
- Reusable UI components in separate `ui/` folder
- Common components for shared functionality
- Index files for clean imports and exports

### Service Layer Pattern
- Centralized services in `src/services/`
- Database service with connection management
- OpenAI service with flexible response types
- Configuration management

### Configuration Management
- Environment-specific configurations
- Centralized database configuration
- Service configuration files

## 📝 File Naming Conventions

### Components
- **PascalCase** for component files (e.g., `Button.jsx`)
- **camelCase** for utility files (e.g., `utils.js`)
- **kebab-case** for configuration files (e.g., `database-setup.md`)

### Directories
- **lowercase** for most directories
- **PascalCase** for component directories when needed

### Documentation
- **UPPERCASE** for main documentation files
- **Descriptive names** for specific guides

---

## 📋 Update History

| Date | Changes | Updated By |
|------|---------|------------|
| 2024-09-28 | Initial structure documentation | AI Assistant |
| 2024-09-28 | Moved documentation to docs/ folder | AI Assistant |
| 2024-09-28 | Removed examples and seed files | AI Assistant |

---

**Note**: This file should be updated whenever the project structure changes to maintain accurate documentation.
