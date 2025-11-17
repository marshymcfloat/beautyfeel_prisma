# BeautyFeel - Beauty & Spa Management System

A comprehensive Next.js-based management system for beauty and spa businesses, featuring transaction management, employee payroll, attendance tracking, customer management, and real-time updates.

## 🚀 Features

### Core Functionality
- **Transaction Management**: Complete POS system for service bookings and payments
- **Employee Management**: Payroll, attendance tracking, and payslip generation
- **Customer Management**: Customer profiles, appointment tracking, and follow-up recommendations
- **Service Management**: Services, service sets, and pricing management
- **Real-time Updates**: Socket.IO integration for live transaction and service updates
- **Multi-branch Support**: Manage multiple branches with branch-specific data
- **Role-based Access Control**: Owner, Cashier, Worker, Attendance Checker, and Masseuse roles
- **Commission Calculation**: Automated commission calculation with unified calculation logic
- **Email Notifications**: Automated email reminders for appointments and follow-ups

### Technical Features
- **Server-Side Rendering**: Optimized with Next.js 15 App Router and server components
- **Suspense Boundaries**: Loading skeletons for better UX
- **Error Boundaries**: Graceful error handling across the application
- **Real-time Synchronization**: WebSocket connections for live updates
- **Secure Authentication**: NextAuth.js with JWT strategy and password change enforcement

## 🛠️ Tech Stack

### Frontend
- **Next.js 15.2.1** - React framework with App Router
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Redux Toolkit** - State management
- **Socket.IO Client** - Real-time communication
- **Recharts** - Data visualization
- **Lucide React** - Icons

### Backend
- **Next.js API Routes** - Serverless API endpoints
- **Express.js** - Socket.IO server
- **Socket.IO** - WebSocket server
- **Prisma** - ORM for database operations
- **PostgreSQL** - Database
- **NextAuth.js** - Authentication
- **bcryptjs** - Password hashing
- **Resend** - Email service

### Additional Tools
- **Zod** - Schema validation
- **date-fns** - Date manipulation
- **BullMQ** - Job queue management
- **Redis** - Caching and job queue

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** 18+ and npm/yarn/pnpm
- **PostgreSQL** 12+ database
- **Redis** (optional, for job queues and caching)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd beautyfeel
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   # Database
   DATABASE_URL="postgresql://user:password@localhost:5432/beautyfeel?schema=public"

   # NextAuth
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="your-secret-key-here"

   # Email (Resend)
   RESEND_API_KEY="your-resend-api-key"

   # Redis (optional)
   REDIS_URL="redis://localhost:6379"

   # Timezone
   TIMEZONE="Asia/Manila"

   # Commission Rates
   SALARY_COMMISSION_RATE="0.1"
   MASSEUSE_COMMISSION_RATE="0.5"

   # Socket.IO Server
   SOCKET_PORT=3001
   ```

4. **Set up the database**
   ```bash
   # Generate Prisma Client
   npx prisma generate

   # Run migrations
   npx prisma migrate dev

   # (Optional) Seed the database
   npm run prisma:seed
   ```

5. **Start the development server**
   ```bash
   # Start Next.js dev server
   npm run dev

   # In a separate terminal, start the Socket.IO server
   cd backend
   node server.js
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
beautyfeel/
├── app/                      # Next.js App Router
│   ├── (logged)/            # Protected routes (require authentication)
│   │   └── [accountID]/     # Account-specific routes
│   │       ├── page.tsx     # Dashboard (server component)
│   │       ├── cashier/     # POS system
│   │       ├── work/        # Employee work interface
│   │       └── manage/      # Admin management interface
│   ├── (marketing)/          # Public routes
│   │   ├── login/          # Login page
│   │   └── auth/            # Authentication routes
│   └── api/                 # API routes
│       ├── auth/            # NextAuth endpoints
│       ├── accounts/        # Account management
│       ├── services/        # Service management
│       └── ...
├── backend/                 # Socket.IO server
│   └── server.js           # WebSocket server
├── components/              # React components
│   ├── ui/                 # UI components
│   ├── Buttons/            # Button components
│   ├── Inputs/             # Form inputs
│   └── ...
├── lib/                     # Utility libraries
│   ├── ServerAction.ts     # Server actions
│   ├── SalaryActions.ts    # Payroll actions
│   ├── authOptions.ts      # NextAuth configuration
│   ├── prisma.ts           # Prisma client
│   └── ...
├── prisma/                  # Database schema and migrations
│   ├── schema.prisma       # Prisma schema
│   └── migrations/         # Database migrations
└── public/                  # Static assets
```

## 🔐 Authentication

The application uses NextAuth.js with a credentials provider. Key features:
- JWT-based session management
- Password change enforcement for new users
- Role-based access control
- Secure password hashing with bcryptjs

### Default Roles
- **OWNER**: Full system access
- **CASHIER**: Transaction management
- **WORKER**: Service execution and tracking
- **ATTENDANCE_CHECKER**: Attendance management
- **MASSEUSE**: Special commission rate

## 💰 Payroll System

The payroll system includes:
- **Base Salary**: Calculated from daily rate × attendance days
- **Commission**: Calculated per service unit with unified calculation logic
- **Payslip Generation**: Automated payslip creation and approval workflow
- **Salary Tracking**: Real-time salary accumulation and deduction

### Commission Calculation
Commissions are calculated using a unified helper function that:
- Accounts for transaction-level discounts
- Applies different rates for masseuses vs. other employees
- Ensures consistent calculations across all features

## 🚀 Scripts

```bash
# Development
npm run dev              # Start Next.js dev server

# Production
npm run build           # Build for production
npm run start           # Start production server

# Database
npx prisma generate     # Generate Prisma Client
npx prisma migrate dev  # Run migrations
npx prisma studio       # Open Prisma Studio
npm run prisma:seed     # Seed database

# Linting
npm run lint            # Run ESLint
```

## 🔄 Real-time Updates

The application uses Socket.IO for real-time synchronization:
- Transaction status updates
- Service unit completion tracking
- Live dashboard updates
- Multi-client synchronization

Socket.IO server runs on port 3001 (configurable via environment variables).

## 📊 Key Features Explained

### Server-Side Rendering
All main pages use Next.js server components with:
- Initial data fetching on the server
- Suspense boundaries with skeleton fallbacks
- Error boundaries for graceful error handling
- Parallel data fetching with `Promise.all`

### Unified Commission Calculation
A single source of truth for commission calculations ensures consistency across:
- Payslip generation
- Salary breakdowns
- Employee work history
- Real-time salary tracking

### Secure Authentication Flow
- Password change enforcement for new users
- Middleware-based route protection
- Consistent redirect logic
- Timing attack prevention

## 🧪 Development Guidelines

### Adding New Features
1. Create server components for data fetching
2. Create client components for interactivity
3. Use Suspense boundaries for loading states
4. Implement error boundaries
5. Follow the established patterns in existing pages

### Database Changes
1. Update `prisma/schema.prisma`
2. Create a migration: `npx prisma migrate dev --name your-migration-name`
3. Update Prisma Client: `npx prisma generate`

### Code Style
- Use TypeScript for type safety
- Follow Next.js 15 App Router conventions
- Use server components by default
- Extract client-side logic to separate components

## 📝 Environment Variables

Required environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_URL` - Application URL
- `NEXTAUTH_SECRET` - Secret for JWT signing
- `RESEND_API_KEY` - Email service API key
- `TIMEZONE` - Application timezone (default: Asia/Manila)
- `SALARY_COMMISSION_RATE` - Default commission rate (default: 0.1)
- `MASSEUSE_COMMISSION_RATE` - Masseuse commission rate (default: 0.5)
- `SOCKET_PORT` - Socket.IO server port (default: 3001)

## 🐛 Troubleshooting

### Database Connection Issues
- Verify `DATABASE_URL` is correct
- Ensure PostgreSQL is running
- Check database permissions

### Authentication Issues
- Verify `NEXTAUTH_SECRET` is set
- Check `NEXTAUTH_URL` matches your application URL
- Clear browser cookies if session issues persist

### Socket.IO Connection Issues
- Ensure backend server is running on the correct port
- Check CORS configuration in `backend/server.js`
- Verify Socket.IO client connection URL

## 📄 License

This project is private and proprietary.

## 🤝 Contributing

This is a private project. For questions or issues, please contact the development team.

---

Built with ❤️ using Next.js and TypeScript
