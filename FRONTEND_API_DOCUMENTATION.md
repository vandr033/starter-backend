# Frontend API Documentation

> **Generated:** 2026-01-20  
> **Base URL:** `http://localhost:3001/api`  
> **Tech Stack:** Express.js + Prisma + MySQL + Better Auth

---

## Table of Contents

1. [Standard Response Format](#standard-response-format)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
   - [Auth Routes](#auth-routes)
   - [Home Routes](#home-routes)
   - [Company Routes](#company-routes)
4. [Data Models](#data-models)
5. [Enums](#enums)

---

## Standard Response Format

All API responses follow this structure:

```typescript
interface MensajeApi {
  code: number;           // HTTP status code
  error: boolean;         // true if error occurred
  message: string;        // Human readable message
  technicalMessage?: string; // Debug/error details (optional)
  data?: any;             // Response payload (optional)
}
```

### Example Success Response
```json
{
  "code": 200,
  "error": false,
  "message": "Successfully retrieved all companies",
  "data": [...]
}
```

### Example Error Response
```json
{
  "code": 400,
  "error": true,
  "message": "Faltan datos"
}
```

---

## Authentication

### Better Auth (Built-in)

The backend uses **Better Auth** for authentication. It is mounted on `/api/auth` and handles:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/sign-in/email` | POST | Email/password sign in |
| `/api/auth/sign-up/email` | POST | Email/password sign up |
| `/api/auth/sign-out` | POST | Sign out |
| `/api/auth/session` | GET | Get current session |
| `/api/auth/forget-password` | POST | Request password reset email |
| `/api/auth/reset-password` | POST | Reset password with token |

> **Note:** Better Auth endpoints are handled automatically. Refer to [Better Auth docs](https://www.better-auth.com/docs) for full details.

### Phone OTP (via Better Auth plugin)

| Feature | Value |
|---------|-------|
| OTP Length | 6 digits |
| Expires In | 300 seconds (5 min) |
| Max Attempts | 3 |

### Custom Customer Registration Flow (Email)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/customer/email/start` | POST | Send verification code to email |
| `/api/auth/customer/email/verify` | POST | Verify email code, get preRegToken |
| `/api/auth/customer/complete-email` | POST | Complete registration with token |

---

## API Endpoints

### Auth Routes

Base: `/api/auth`

#### 1. Send Email Verification Code

```http
POST /api/auth/customer/email/start
```

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "code": 200,
  "error": false,
  "message": "Codigo de verificacion enviado"
}
```

---

#### 2. Verify Email Code

```http
POST /api/auth/customer/email/verify
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Response:**
```json
{
  "code": 200,
  "error": false,
  "message": "Codigo verificado",
  "data": {
    "preRegToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

---

#### 3. Complete Customer Registration

```http
POST /api/auth/customer/complete-email
```

**Request Body:**
```json
{
  "preRegToken": "eyJhbGciOiJIUzI1NiIs...",
  "email": "user@example.com",
  "password": "securePassword123",
  "first_name": "John",
  "last_name": "Doe" // optional
}
```

**Response:**
```json
{
  "code": 200,
  "error": false,
  "message": "Usuario creado exitosamente",
  "data": {
    "user": { ... },
    "session": { ... }
  }
}
```

---

### Home Routes

Base: `/api/home`

#### 1. Get Service Types

```http
GET /api/home/service-types?query=corte
```

**Query Params:**
- `query` (optional): Filter by name

**Response Data:**
```typescript
Array<{
  id: number;
  key: string;       // e.g., "HAIRCUT"
  name: string;      // e.g., "Corte de cabello"
  description?: string;
}>
```

---

#### 2. Get Cities

```http
GET /api/home/cities?query=santa
```

**Query Params:**
- `query` (optional): Filter cities containing this string

**Response Data:**
```typescript
Array<{
  city: string | null;
}>
```

---

#### 3. Get Categories (Top 4 Company Types)

```http
GET /api/home/categories
```

**Response Data:**
```typescript
Array<{
  id: number;
  key: string;       // e.g., "BARBER_SHOP"
  name: string;      // e.g., "Barbería"
  description?: string;
  icon_name?: string;
  is_active: boolean;
}>
```

---

#### 4. Get Top Shops (Highest Rated)

```http
GET /api/home/top-shops
```

**Response Data:**
```typescript
Array<Company> // Returns up to 6 companies with most reviews
```

---

#### 5. Get FAQ

```http
GET /api/home/faq
```

**Response Data:**
```typescript
Array<{
  id: number;
  question: string;
  answer: string;
}>
```

---

#### 6. Search Companies

```http
GET /api/home/search?service=1&location=Santa Cruz&date=2026-01-25&time=10:00&name=Barbería
```

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| `service` | number (optional) | GlobalServiceType ID |
| `location` | string (optional) | City name (exact match) |
| `date` | string (optional) | YYYY-MM-DD format |
| `time` | string (optional) | HH:mm format |
| `name` | string (optional) | Company name (partial match) |

**Response Data:**
```typescript
Array<{
  category: string | null;    // CompanyType name
  name: string;               // Company name
  city: string | null;
  lat: number | null;
  lng: number | null;
  totalStars: number;         // Average rating (0-5)
  numberOfReviews: number;
  serviceName: string | null; // Cheapest matching service name
  servicePriceCents: number | null;
  slug: string;               // URL-friendly identifier
}>
```

---

### Company Routes

Base: `/api/company`

#### 1. Get All Companies

```http
GET /api/company
```

**Response Data:**
```typescript
Array<Company>
```

---

## Data Models

### Company

```typescript
interface Company {
  id: number;
  slug: string;                    // Unique URL-friendly identifier
  name: string;
  address?: string;
  phone_prefix: string;            // Default: "591"
  phone: string;
  email?: string;
  google_maps_url?: string;
  city?: string;
  state?: string;
  country_code?: string;           // ISO 2-letter code
  latitude?: number;
  longitude?: number;
  timezone: string;
  
  // Image URLs (Azure Blob references)
  logo_url?: string;
  home_hero_image_url?: string;
  about_hero_image_url?: string;
  about_image_1_url?: string;
  about_image_2_url?: string;
  about_image_3_url?: string;
  
  is_active: boolean;
  created_at: DateTime;
  updated_at: DateTime;
  deleted_at?: DateTime;
  company_type_id: number;
}
```

---

### User

```typescript
interface User {
  id: string;                  // CUID
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string;
  first_name?: string;
  last_name?: string;
  phone_prefix?: string;       // e.g., "591"
  phoneNumber?: string;        // e.g., "+59170000000"
  phoneNumberVerified?: boolean;
  is_super_admin: boolean;
  is_active: boolean;
  createdAt: DateTime;
  updatedAt: DateTime;
  deleted_at?: DateTime;
}
```

---

### StaffProfile

```typescript
interface StaffProfile {
  id: number;
  company_id: number;
  user_id: string;
  display_name: string;
  bio?: string;
  image_url?: string;
  is_bookable: boolean;
  created_at: DateTime;
  updated_at: DateTime;
  deleted_at?: DateTime;
}
```

---

### CustomerProfile

```typescript
interface CustomerProfile {
  id: number;
  company_id: number;
  user_id: string;
  notes?: string;
  preferred_staff_id?: number;
  created_at: DateTime;
  updated_at: DateTime;
  deleted_at?: DateTime;
}
```

---

### Category

```typescript
interface Category {
  id: number;
  company_id: number;
  name: string;
  slug: string;
  description?: string;
  position: number;             // Display order
  is_active: boolean;
  created_at: DateTime;
  updated_at: DateTime;
  deleted_at?: DateTime;
}
```

---

### Service

```typescript
interface Service {
  id: number;
  company_id: number;
  category_id: number;
  name: string;
  description?: string;
  price_cents: number;          // Price in cents (divide by 100)
  duration_minutes: number;
  position: number;             // Display order
  is_active: boolean;
  global_type_id?: number;      // Link to GlobalServiceType
  created_at: DateTime;
  updated_at: DateTime;
  deleted_at?: DateTime;
}
```

---

### Booking

```typescript
interface Booking {
  id: number;
  company_id: number;
  staff_id: number;
  customer_id?: number;
  
  // Client info (for guest bookings)
  client_name?: string;
  client_email?: string;
  client_phone_prefix?: string;
  client_phone_number?: string;
  
  booking_type: BookingType;     // 'CUSTOMER' | 'BLOCK'
  start_at: DateTime;
  end_at: DateTime;
  status: BookingStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  qr_proof_image_url?: string;
  total_price_cents: number;
  notes?: string;
  
  created_by_user_id?: string;
  updated_by_user_id?: string;
  created_at: DateTime;
  updated_at: DateTime;
  deleted_at?: DateTime;
}
```

---

### BookingService

```typescript
interface BookingService {
  id: number;
  booking_id: number;
  company_id: number;
  service_id: number;
  service_name_snapshot: string;     // Name at time of booking
  price_cents_snapshot: number;      // Price at time of booking
  duration_minutes_snapshot: number;
  position: number;
  created_at: DateTime;
  updated_at: DateTime;
}
```

---

### Hours (Business Hours)

```typescript
interface Hours {
  id: number;
  company_id: number;
  day_of_week: number;    // 0 = Sunday, 6 = Saturday
  open_time?: string;     // "09:00" format
  close_time?: string;    // "18:00" format
  is_closed: boolean;
  created_at: DateTime;
  updated_at: DateTime;
}
```

---

### ThemeConfig

```typescript
interface ThemeConfig {
  id: number;
  company_id: number;
  brand_color: string;               // Hex color, e.g., "#FF5733"
  page_background_color: string;
  page_background_preset: PageBackgroundPreset;
  cards_elevated: boolean;
  corner_radius: CornerRadius;
  created_at: DateTime;
  updated_at: DateTime;
}
```

---

### CompanySettings

```typescript
interface CompanySettings {
  id: number;
  company_id: number;
  booking_buffer_minutes: number;           // Default: 10
  booking_time_granularity_minutes: number; // Default: 5
  cancel_limit_minutes: number;             // Default: 120
  reschedule_limit_minutes: number;         // Default: 120
  allow_qr_payment: boolean;
  qr_image_url?: string;
  allow_cash_payment: boolean;
  send_email_notifications: boolean;
  send_whatsapp_notifications: boolean;
  created_at: DateTime;
  updated_at: DateTime;
}
```

---

### DiscountCode

```typescript
interface DiscountCode {
  id: number;
  company_id: number;
  code: string;
  description?: string;
  type: DiscountType;        // 'PERCENT' | 'FIXED'
  value: Decimal;
  active_from?: DateTime;
  active_until?: DateTime;
  max_uses?: number;
  used_count: number;
  is_active: boolean;
  created_at: DateTime;
  updated_at: DateTime;
  deleted_at?: DateTime;
}
```

---

### Review

```typescript
interface Review {
  id: number;
  company_id: number;
  user_id: string;
  service_id?: number;
  booking_id?: number;    // Unique per booking
  rating: number;         // 1-5 stars
  comment: string;
  created_at: DateTime;
  updated_at: DateTime;
}
```

---

### CompanyType

```typescript
interface CompanyType {
  id: number;
  key: string;            // e.g., "BARBER_SHOP", "NAIL_SALON"
  name: string;           // e.g., "Barbería", "Salón de uñas"
  description?: string;
  icon_name?: string;     // For UI icon mapping
  is_active: boolean;
  created_at: DateTime;
  updated_at: DateTime;
}
```

---

### GlobalServiceType

```typescript
interface GlobalServiceType {
  id: number;
  key: string;            // e.g., "HAIRCUT", "MANICURE"
  name: string;
  description?: string;
}
```

---

### FrequentlyAskedQuestion

```typescript
interface FrequentlyAskedQuestion {
  id: number;
  question: string;
  answer: string;
  created_at: DateTime;
  updated_at: DateTime;
}
```

---

## Enums

```typescript
enum PageBackgroundPreset {
  light = 'light',
  soft = 'soft',
  dark = 'dark',
  auto = 'auto'
}

enum CornerRadius {
  sm = 'sm',
  md = 'md',
  lg = 'lg'
}

enum CompanyUserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
  CUSTOMER = 'CUSTOMER'
}

enum BookingType {
  CUSTOMER = 'CUSTOMER',
  BLOCK = 'BLOCK'
}

enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED'
}

enum PaymentMethod {
  NONE = 'NONE',
  CASH = 'CASH',
  QR = 'QR'
}

enum PaymentStatus {
  UNPAID = 'UNPAID',
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  PAID = 'PAID'
}

enum DiscountType {
  PERCENT = 'PERCENT',
  FIXED = 'FIXED'
}

enum VerificationChannel {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP'
}

enum VerificationPurpose {
  CUSTOMER_SIGNUP = 'CUSTOMER_SIGNUP'
}
```

---

## CORS Configuration

The backend accepts requests from:
- `http://localhost:3000`
- `http://127.0.0.1:3000`

**Allowed Methods:** GET, POST, PUT, DELETE, OPTIONS  
**Credentials:** Enabled  
**Allowed Headers:** Content-Type, Authorization

---

## Rate Limiting

| Window | Max Requests |
|--------|--------------|
| 60 seconds | 120 requests |

---

## Notes for Frontend Developers

1. **Price Handling**: All prices are stored in **cents**. Divide by 100 for display.

2. **Image URLs**: Images are stored in Azure Blob Storage. The URL fields contain blob references that need SAS token authentication.

3. **Timezone**: Companies have their own `timezone` field. Handle date/time conversions appropriately.

4. **Soft Deletes**: Most entities use `deleted_at` for soft deletes. Filter by `is_active: true` is applied server-side.

5. **Phone Format**: 
   - `phone_prefix`: Country code without "+" (e.g., "591")
   - `phoneNumber`: Full international format (e.g., "+59170000000")

6. **Session Management**: Better Auth handles sessions via HTTP-only cookies. Include `credentials: 'include'` in fetch requests.
