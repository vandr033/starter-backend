# Live demo architecture

This inventory was written from the active `starter-backend/src/routes/index.ts`, Express middleware, Prisma schema, and `reservas-front/app` routes. The route inventory document is a useful index, but the implementation files below are authoritative.

## Existing production paths

| Area | Canonical implementation |
| --- | --- |
| Better Auth | `src/config/auth.ts`; mounted as `/api/auth/*` by `src/app.ts` |
| Admin sign-in/session | `src/routes/admin-auth.routes.ts`, `src/controllers/admin-auth.controller.ts`, `src/services/admin-auth.service.ts`; `/api/admin/auth/*` |
| Authenticated request | `src/middlewares/requireAuth.ts`; Better Auth session then the full `User` row |
| Active company | `src/utils/active-shop-cookie.ts`; `active_company_id` is read in `requireCompanyRole` |
| Membership and role | `requireCompanyRole` resolves `CompanyUser` and calls `resolveCompanyContextForUser` from `src/services/company-access.service.ts` |
| Company switching | `POST /api/admin/auth/active-shop` in the admin auth router/controller/service |
| Product/capability access | `src/middlewares/requirePlanFeature.ts`, `requireCompanyCapability.ts`, `src/services/company-entitlements.service.ts`, and `company-access.service.ts` |
| Admin layout | `reservas-front/app/admin/layout.tsx` installs `AdminAuthProvider`; `app/admin/dashboard/layout.tsx` applies role and capability navigation/access |
| Admin API client | `reservas-front/app/admin/contexts/AdminAuthContext.tsx` calls the same `/api/admin/auth/*` endpoints with credentials |
| Public shop | `reservas-front/app/shop/[slug]/*`; data APIs are mounted by `src/routes/index.ts` |
| Reservations | Frontend `/admin/dashboard/bookings`, `/services`, `/staff`, `/hours`; backend `admin-booking`, `admin-service`, `admin-staff`, `admin-hours`, `admin-categories`, `booking` routes |
| Restaurant | Frontend `/admin/dashboard/restaurant/*`; backend `admin-restaurant*` routers mounted under `/api/admin/restaurant`; public routes `/api/restaurant/public/*` |
| Events | Frontend `/admin/dashboard/group-reservations/events`; backend `admin-group-event.routes.ts` mounted at `/api/admin/group/events`; public operations in `/api/group/*` |
| Classes | Frontend `/admin/dashboard/group-reservations/classes`; backend `admin-group-class.routes.ts` mounted at `/api/admin/group/classes`; public operations in `/api/group/*` |
| Store/Commerce | Frontend `/admin/dashboard/store/*`; backend `admin-commerce.routes.ts` mounted at `/api/admin/commerce`; public store APIs in `/api/public/commerce/:slug/*` |
| CRM and messaging | Frontend customer/communications pages; backend `/api/admin/customers` and `/api/admin/outbound-messages` |
| Metrics | Backend `/api/admin/dashboard/metrics`, group metrics services, and restaurant/commerce metrics services |
| Branding/page settings | Backend `/api/admin/theme`, `/api/admin/settings`, restaurant/storefront routes; Prisma `ThemeConfig`, `CompanySettings`, and company config rows |
| Staff | Backend `/api/admin/staff`, `/api/admin/staff/*`, and restaurant staff routes; public class/event instructor links use `StaffProfile` |
| Notifications and WhatsApp | `services/outbound-message.service.ts`, durable `OutboundMessageJob` outbox, `whatsapp-worker.service.ts`, `utils/whatsappSender.ts`, and `notification-provider.service.ts` |
| Email | `utils/sendEmail.ts` and `utils/bookingNotifications.ts`, backed by `notification-provider.service.ts` |
| Uploads/storage | `src/routes/admin-upload.routes.ts`, `public-upload.routes.ts`, `admin-image.routes.ts`; writes ultimately use `services/storage.service.ts` |
| Webhook | Customer export in `services/customer.service.ts` posts to `N8N_CUSTOMER_EXPORT_WEBHOOK_URL` |
| Ticket generation | `services/group-ticket.service.ts` and `group-ticket-qr.service.ts`; can enqueue email/WhatsApp delivery |

The active admin POST/PUT/PATCH/DELETE routes are business commands (create, edit, status changes, retry/cancel, upload, switch company, communication, or configuration). Read-only admin screens use GET. The generic demo guard can therefore reject unsafe methods for a demo session while leaving GET APIs and public browse/availability reads available.

`/api/v1/auth/*` is a separate custom compatibility router that remains mounted beside Better Auth. The demo flow does not use or mint sessions through that route; it uses the dedicated `DemoSession` cookie before both auth routers and the production `/api/admin/auth/*` company-context APIs. The active `/api/admin/restaurant/*`, `/api/admin/group/*`, and `/api/admin/commerce/*` route families are split by capability and composed in `routes/index.ts`, rather than copied into demo-only endpoints.

## Demo boundary

The demo launcher resolves a key through `src/config/demo-profiles.ts`. The registry maps each key to its seeded company slug, product/add-on entitlements, public destination, and actual admin destination. `prisma/seed.demo.ts` creates the operator, tenant membership, modular subscriptions, and repeatable operational fixtures for all profiles. Run `npm run seed:demo` after applying migrations.

| Profile | Seeded tenant | Public route | Admin route |
| --- | --- | --- | --- |
| Reservas | `atelier-27-demo` | `/shop/atelier-27-demo/services` | `/admin/dashboard/bookings` |
| Restaurante | `casa-patio-demo` | `/shop/casa-patio-demo/menu` | `/admin/dashboard/restaurant` |
| Eventos | `distrito-demo` | `/shop/distrito-demo/events` | `/admin/dashboard/group-reservations/events` |
| Clases | `forma-studio-demo` | `/shop/forma-studio-demo/classes` | `/admin/dashboard/group-reservations/classes` |
| Tienda | `nativa-demo` | `/shop/nativa-demo/store` | `/admin/dashboard/store` |
| Suite completa | `club-horizonte-demo` | `/shop/club-horizonte-demo` | `/admin/dashboard` |

The `DemoSession` table stores a SHA-256 token hash, the canonical profile key, operator and tenant IDs, expiry, and revocation time. Launch returns only public profile metadata and sets the opaque token in the `priconpri_demo_session` HttpOnly cookie for 45 minutes. Session resolution checks the profile-to-slug mapping and active operator/company records on each API request.

The demo middleware runs before Better Auth and permits only the launcher, demo logout, and admin sign-out POSTs. It rejects the rest of unsafe methods for demo sessions. Public writes also reject seeded slugs and company IDs; booking edits, restaurant cancellations, class attendance links, and upload intents are checked by their tenant-bound records.

For requests with a demo session, authentication uses the seeded demo operator, company-role resolution is pinned to the session company, admin tenant mutations are denied centrally, and admin shop/session endpoints expose only that company. Email and WhatsApp delivery, customer export webhooks, and storage writes check request context and/or company ID; the WhatsApp worker also skips any persisted job for a demo tenant.

The public `/shop/[slug]` journeys continue to use their current pages and APIs. Booking, restaurant reservation, event, class, and store checkout final actions show a shared demo explanation and open the same profile in the admin panel without creating a reservation/order or starting OTP delivery. Backend guards remain authoritative if a client bypasses the dialog.

Fixtures include recent and future bookings with varied statuses, services, staff schedules, customer profiles and reviews; restaurant tables, service periods, menu items, reservations, deposits, waitlist entries, floor states, dining CRM profiles, shifts and closeouts; events with past/free/paid/near-capacity/full examples, tickets and waitlisted guests; recurring class sessions, enrollments, attendance and missed visits; and store products, stock, pickup and order history. The fixed `demo-fixture:seed:v1` marker and stable natural keys keep repeated runs from duplicating these records. Demo media points to existing local PriConPri static assets, so visitors do not need a third-party image provider.

The MySQL integration test in `tests/demo-session.mysql.integration.test.ts` checks allowed-session creation/resolution, active-company cookie tampering, tenant lock, and fixture count stability across two seed passes. It intentionally requires a disposable database and separate opt-in flags.
