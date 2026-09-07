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
| `npm run worker:whatsapp` | Start the durable WhatsApp outbox worker |
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
```env
DATABASE_URL="mysql://user:password@localhost:3306/database_name"
PORT=3000
NODE_ENV=development
# Notifications are fail-closed by default.
MAIL_ENABLED=false
MAIL_TRANSPORT=disabled
MAIL_HOST=""
MAIL_PORT=587
MAIL_SECURE=false
MAIL_FROM=""
MAIL_USER=""
MAIL_PASS=""
WAHA_ENABLED=false
WAHA_TRANSPORT=disabled
WAHA_BASE_URL=""
WAHA_API_KEY=""
WAHA_SESSION="default"
WAHA_TIMEOUT_MS=15000
WAHA_MIN_INTERVAL_MS=5000
WAHA_DISCONNECT_ALERT_EMAIL="sebastian.andradeg@outlook.com"
WAHA_MONITOR_INTERVAL_MS=30000
WHATSAPP_WORKER_ENABLED=true
WHATSAPP_WORKER_POLL_INTERVAL_MS=5000
WHATSAPP_JOB_LEASE_MS=120000
WHATSAPP_WORKER_SHUTDOWN_TIMEOUT_MS=20000
WHATSAPP_MAX_ATTEMPTS=8
# Public upload intent settings
UPLOAD_INTENT_SECRET=""
UPLOAD_INTENT_TTL_SECONDS=600
UPLOAD_RATE_LIMIT_MAX_PER_MINUTE=30
STORAGE_DELETE_TOKEN_TTL_SECONDS=3600
```

Set `MAIL_ENABLED=true` only with an explicit `MAIL_TRANSPORT` (`remote`/SMTP requires
`MAIL_HOST`, `MAIL_FROM`, `MAIL_USER`, and `MAIL_PASS`; `sink` captures mail locally for
development). The backend never selects `smtp.gmail.com` implicitly. Set `WAHA_ENABLED=true`
and `WAHA_TRANSPORT=remote` only when `WAHA_BASE_URL` points to the API origin; `sink` is a
local/test transport and `disabled` performs no external request.

If your WAHA instance does not require API auth, you can leave `WAHA_API_KEY` empty and the
backend will omit `X-Api-Key`.

The backend checks the configured WAHA session every 30 seconds. It sends one email to
`WAHA_DISCONNECT_ALERT_EMAIL` when the session is stopped, failed, missing, or requires a
new QR code. Repeated checks during the same outage do not send duplicate emails; the alert
resets after the session returns to `WORKING`. The durable worker independently polls more
frequently, pauses while WAHA is not `WORKING`, and resumes pending jobs automatically.
Email delivery uses the existing `MAIL_*` configuration.

Quick WAHA smoke test:
```bash
curl -X POST https://waha.priconpri.com/api/sendText \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_API_KEY" \
  -d '{"session":"default","chatId":"591XXXXXXXX@c.us","text":"Test from WAHA"}'
```

See `.env.example` for all available options.

WhatsApp messages are persisted in the MySQL outbox before delivery. The web
server starts the worker automatically, or production can run the same image
with `npm run worker:whatsapp` as a separate process. Pending jobs survive
backend/worker restarts and pause while the configured WAHA session is not
`WORKING`; they resume automatically after the next healthy poll. See
`WHATSAPP_DELIVERY_REMEDIATION.md` for statuses, retry/expiration rules,
batch-progress endpoints, and the exact meaning of `SENT`.

## 📲 Super Admin WAHA Dashboard

The backend exposes a protected WAHA admin module for the Super Admin dashboard.

### Required env vars
- `WAHA_BASE_URL`
- `WAHA_API_KEY`
- `WAHA_SESSION`

Optional but recommended:
- `WAHA_TIMEOUT_MS`

`WAHA_API_KEY` is used only by the backend. It is never sent to the frontend.

### Backend endpoints
- `GET /api/super-admin/waha/status`
- `GET /api/super-admin/waha/qr`
- `POST /api/super-admin/waha/session/start`
- `POST /api/super-admin/waha/session/restart`
- `POST /api/super-admin/waha/session/logout`

All of these routes reuse the existing auth stack and return `403` for non-super-admin users.

### How to test the WAHA connection
1. Start the backend with the WAHA env vars configured.
2. Sign in to the frontend as a super admin.
3. Open `/admin/super-admin/waha`.
4. If the session is missing or stopped, click `Start Session`.
5. If WAHA requests authentication, scan the QR code with WhatsApp.
6. Use `Refresh Status` to verify that the session moves to `Connected`.

### Troubleshooting disconnected sessions
- If the session does not exist yet, use `Start Session` from the dashboard to create and start the configured WAHA session.
- If the QR expires before anyone scans it, use `Refresh QR` instead of reloading the whole admin panel.
- If the session stays disconnected after scanning, use `Restart Session` and verify that `WAHA_API_KEY` matches the hosted WAHA instance.
- If the dashboard shows upstream WAHA errors, confirm that `WAHA_BASE_URL` points to the WAHA API origin and not to a separate dashboard URL.

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
