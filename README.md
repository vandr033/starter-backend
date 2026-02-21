# Starter Backend

A Node.js/TypeScript backend API built with **Express 5** and **Prisma ORM**. Features multi-tenant company management, bookings, authentication, and a clean layered architecture.

## 🚀 Quick Start

### Prerequisites
- Node.js (v18+)
- MySQL (v8.0+)

### Installation
```bash
npm install
cp .env.example .env  # Edit with your DATABASE_URL
npx prisma generate
npx prisma migrate dev
npm run prisma:seed    # Seed initial data
npm run dev
```

The API runs at `http://localhost:3000`.

## 📁 Project Structure

```
starter-backend/
├── prisma/
│   ├── schema.prisma      # Database schema
│   ├── seed.ts            # Seed data
│   └── migrations/        # Prisma migrations
├── src/
│   ├── controllers/       # Request handlers
│   ├── services/          # Business logic
│   ├── repositories/      # Prisma data access layer
│   ├── routes/            # Express routes
│   ├── middlewares/       # Auth, validation
│   ├── schemas/           # Zod validation schemas
│   ├── prisma/            # Prisma client instance
│   ├── config/            # Environment, logger
│   ├── utils/             # Helpers
│   ├── types/             # TypeScript types
│   ├── app.ts             # Express app setup
│   └── server.ts          # Entry point
└── package.json
```

## 🛠️ Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm start` | Start production server |
| `npm run prisma:seed` | Run Prisma seed script |

### Prisma Commands
```bash
npx prisma migrate dev      # Create & apply migrations
npx prisma migrate deploy   # Apply migrations (production)
npx prisma studio           # Database GUI
npx prisma generate         # Regenerate Prisma Client
```

## 🗄️ Database Schema

The Prisma schema includes:

### Core Entities
- **Company** - Multi-tenant businesses (barber shops, nail salons, etc.)
- **User** - User accounts with authentication
- **CompanyUser** - User roles within companies (OWNER, ADMIN, STAFF, CUSTOMER)

### Profiles
- **StaffProfile** - Staff member details & bookability
- **CustomerProfile** - Customer notes & preferences

### Services & Bookings
- **Category** - Service categories per company
- **Service** - Services with pricing & duration
- **Hours** - Company operating hours
- **Booking** - Appointment bookings with status tracking
- **BookingService** - Services included in bookings

### Configuration
- **ThemeConfig** - Company branding (colors, corner radius)
- **CompanySettings** - Booking rules, payment options, notifications
- **DiscountCode** / **BookingDiscount** - Discount management

### Other
- **CompanyType** / **GlobalServiceType** - Business categorization
- **Review** - Customer reviews
- **ConfigMessage** - Configurable notification templates
- **VerificationCode** - Email/WhatsApp verification

## 🔐 Authentication

Uses [better-auth](https://github.com/better-auth/better-auth) for authentication:
- Session-based authentication
- Email verification
- JWT refresh tokens stored in database

## 🔧 Environment Variables
`
```env
DATABASE_URL="mysql://user:password@localhost:3306/database_name"
PORT=3000
NODE_ENV=development
```

See `.env.example` for all available options.
`
## 📚 API Routes

| Prefix | Description |
|--------|-------------|
| `/api/auth/*` | Authentication endpoints |
| `/api/users/*` | User management |
| `/api/companies/*` | Company operations |
| `/api/home/*` | Home/public endpoints |

## 🧱 Architecture

The project follows a layered architecture:

```
Routes → Controllers → Services → Repositories → Prisma Client → MySQL
```

- **Routes**: Define endpoints and middlewares
- **Controllers**: Handle HTTP request/response
- **Services**: Business logic and orchestration
- **Repositories**: Data access via Prisma

## 📝 Adding New Features

### 1. Update Prisma Schema
```prisma
// prisma/schema.prisma
model NewEntity {
  id        Int      @id @default(autoincrement())
  name      String   @db.VarChar(191)
  createdAt DateTime @default(now()) @map("created_at")
  @@map("new_entity")
}
```

### 2. Generate & Migrate
```bash
npx prisma migrate dev --name add_new_entity
```

### 3. Create Repository
```typescript
// src/repositories/newEntity.repo.ts
import { prisma } from '../prisma/client';

export const getAll = () => prisma.newEntity.findMany();
export const create = (data: Prisma.NewEntityCreateInput) => 
  prisma.newEntity.create({ data });
```

### 4. Create Service & Controller
Follow the existing patterns in `src/services/` and `src/controllers/`.

### 5. Add Routes
```typescript
// src/routes/newEntity.routes.ts
import { Router } from 'express';
const router = Router();
router.get('/', Controller.getAll);
export default router;
```

---

**Happy Coding! 🚀**
