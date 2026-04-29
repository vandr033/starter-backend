# Notification Capability Map

## Scope

This map classifies the notification and messaging flows currently present in PriConPri after the Mensajeria Base / Mensajeria Pro split.

## MENSAJERIA_BASE

- Booking confirmations and essential booking updates
  - `src/services/booking.service.ts`
  - `src/services/admin-booking.service.ts`
  - `src/utils/bookingNotifications.ts`
  - Includes customer confirmation, pending-management notice, cancellation notice, reschedule/update notice, and essential internal admin/staff notice when already implemented.

- No-show notifications
  - `src/services/admin-booking.service.ts`
  - `src/utils/bookingNotifications.ts`
  - Classified as essential transactional communication.

- Required product-flow delivery for tickets and confirmations
  - `src/services/group-ticket.service.ts`
  - `src/services/free-event-registration.service.ts`
  - Event/class ticket delivery and free-event confirmation/invite delivery are treated as transactional product-flow messaging, not campaign messaging.

- Basic settings toggles
  - `src/controllers/admin-settings.controller.ts`
  - `prisma/schema.prisma`
  - `send_email_notifications`
  - `send_whatsapp_notifications`

## MENSAJERIA_PRO

- Booking reminders
  - `src/services/admin-booking.service.ts`
  - `src/routes/admin-booking.routes.ts`
  - `src/utils/bookingNotifications.ts`

- Review request automation
  - `src/utils/reviewNotifications.ts`
  - Triggered from `src/services/admin-booking.service.ts` on completed bookings.

- Bulk customer messaging
  - `src/routes/admin-customer.routes.ts`
  - `src/controllers/admin-customer.controller.ts`
  - Customer mass message flow requires CRM Pro plus Mensajeria Pro.

- Event mass messaging
  - `src/routes/admin-group-booking.routes.ts`
  - `src/services/group-booking.service.ts`
  - Bulk outbound messaging to event audiences is Pro messaging.

- WhatsApp group broadcast tooling for events
  - `src/routes/admin-group-event.routes.ts`
  - `src/controllers/admin-group-event.controller.ts`
  - Group creation/send actions are treated as bulk WhatsApp tooling.

- Installment reminders
  - `src/services/group-payments.service.ts`
  - `src/routes/admin-group-booking.routes.ts`
  - Requires `CLASES_PRO` and `MENSAJERIA_PRO`.

- Campaigns and reactivation
  - Customer communications surface and CRM reactivation workflows
  - `src/routes/admin-customer.routes.ts`
  - `src/config/product-entitlements.ts`
  - Campaign sending depends on Mensajeria Pro; reactivation also depends on CRM Pro.

- Templates
  - No dedicated persisted template-management backend module yet.
  - Frontend should present this as a Mensajeria Pro capability placeholder.

- Delivery logs later / automation rules later
  - Not implemented as first-class product modules yet.
  - Installment reminder logs exist today:
    - `src/services/group-payments.service.ts`
    - `prisma/schema.prisma` (`InstallmentReminderLog`)
  - These are partial delivery/audit data, not a general messaging log product yet.

## Product-Specific Notification

- Waitlist spot-opened notices for paid events
  - `src/services/group-booking.service.ts`
  - Product-specific event workflow messaging.

- New review notifications sent to owners/admins
  - `src/utils/reviewNotifications.ts`
  - Operational review alert, not customer campaign messaging.

- Authentication and verification messages
  - `src/services/profile.service.ts`
  - `src/services/admin-auth.service.ts`
  - `src/services/class-guest-enrollment.service.ts`
  - Outside the Mensajeria commercial split. These are auth/account flows.

## Operational / Tooling, Not Commercial Mensajeria

- Sender utilities
  - `src/utils/whatsappSender.ts`
  - `src/utils/sendEmail.ts`
  - Shared infrastructure used by Base, Pro, auth, and ops flows.

- Super admin delivery diagnostics
  - `src/services/super-admin-notifications.service.ts`
  - `src/controllers/super-admin-notifications.controller.ts`
  - Test tooling, not a sellable customer-facing messaging feature.

## Currently Unused / Dead Code

- No customer-facing messaging flow was confidently marked as dead during this pass.
- `super-admin-notifications.service.ts` is not dead code, but it is operational tooling and should stay outside the Mensajeria packaging rules.
