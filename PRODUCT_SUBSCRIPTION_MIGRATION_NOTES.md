# Product Subscription Migration Notes

Date: 2026-04-27

## Summary

This migration adds a modular commercial data model to the PriconPri backend while keeping the legacy fixed-plan fields fully intact for backward compatibility.

The following legacy fields and tables remain unchanged and are still used as compatibility inputs:

- `Company.plan`
- `Company.billingCycle`
- `Company.pricePaid`
- `Company.availableUntil`
- `CompanySubscriptionHistory`

## New database models

The backend now includes:

- `ProductCatalog`
- `ProductTier`
- `ProductTierCapability`
- `CompanyProductSubscription`
- `CompanyCapabilityOverride`
- `CompanyProductHistory`

`CompanyProductSubscription` was normalized to reference catalog and tier rows instead of storing only enum codes directly.

## Seeded catalog structure

Seeded products:

- `RESERVAS`
- `EVENTOS`
- `CLASES`
- `PERSONALIZACION`
- `CRM`
- `MENSAJERIA`
- `METRICAS`
- `MARKETPLACE`

Seeded tiers:

- `RESERVAS_BASE`
- `RESERVAS_PRO`
- `EVENTOS_BASE`
- `EVENTOS_PRO`
- `CLASES_BASE`
- `CLASES_PRO`
- `PERSONALIZACION_BASE`
- `PERSONALIZACION_PLUS`
- `CRM_BASE`
- `CRM_PRO`
- `MENSAJERIA_BASE`
- `MENSAJERIA_PRO`
- `METRICAS_BASE`
- `METRICAS_PRO`
- `MARKETPLACE_PLUS`

## Compatibility choice

`CRM_BASE`, `MENSAJERIA_BASE`, `PERSONALIZACION_BASE`, and `METRICAS_BASE` are currently stored as real `ProductTier` rows instead of being purely implicit capabilities.

Reason:

- it keeps the backfill explicit and auditable
- it avoids hard-coded legacy exceptions in the resolver
- it allows legacy bundles to be represented with normal subscription rows plus targeted overrides

These tiers are compatibility-friendly transitional rows and can later be collapsed into implicit grants if the commercial catalog no longer needs them as standalone records.

## Backfill behavior

Only companies with zero modular subscriptions are backfilled.

Backfill mapping:

- `STARTER` -> `RESERVAS_BASE`, `CRM_BASE`, `PERSONALIZACION_BASE`, `MENSAJERIA_BASE`
- `BUSINESS` -> `RESERVAS_PRO`, `EVENTOS_BASE`, `CRM_BASE`, `MENSAJERIA_BASE`, `METRICAS_BASE`, `PERSONALIZACION_BASE`
- `PRO` -> `RESERVAS_PRO`, `EVENTOS_PRO`, `CLASES_PRO`, `CRM_PRO`, `MENSAJERIA_PRO`, `METRICAS_PRO`, `PERSONALIZACION_PLUS`

`BUSINESS` needs targeted `CompanyCapabilityOverride` rows to reproduce the old plan exactly without over-granting Pro features:

- `MENSAJERIA_REMINDERS`
- `METRICAS_OPERATIONAL_DASHBOARD`
- `METRICAS_REVIEW_ANALYTICS`
- `STOREFRONT_SECTION_ORDER`
- `STOREFRONT_FOOTER_CUSTOMIZATION`

Each backfilled company also gets a `CompanyProductHistory` row with action `LEGACY_PLAN_BACKFILL`.

## Billing metadata during backfill

- `availableUntil` is copied from `Company.availableUntil` onto every backfilled subscription row.
- `billingCycle` is copied from `Company.billingCycle`.
- `currency` is copied from `Company.currency`.
- `pricePaid` is copied only onto the primary core subscription row to avoid duplicating the legacy bundle amount across every add-on row.

## Entitlement resolution

The resolver now prefers relational modular data:

1. active `CompanyProductSubscription` rows
2. `ProductTierCapability` rows attached to those tiers
3. active `CompanyCapabilityOverride` rows

If a company has no modular subscriptions yet, the resolver falls back to the legacy plan mapping and still returns the same entitlement payload shape.

## Files added or changed

- `prisma/schema.prisma`
- `prisma/migrations/20260427120000_add_company_product_subscriptions/migration.sql`
- `prisma/product-subscriptions.seed.ts`
- `prisma/seed.ts`
- `src/config/product-entitlements.ts`
- `src/services/company-entitlements.service.ts`
- `tests/company-entitlements.service.test.ts`
- `tests/product-subscription-backfill.test.ts`

## Verification

Verified locally with:

- `npx prisma format --schema prisma/schema.prisma`
- `npx prisma generate`
- `npx tsc --noEmit`
- `node --test -r ts-node/register tests/company-entitlements.service.test.ts tests/product-subscription-backfill.test.ts`

## CRM split reference

Customer/CRM capabilities should now be interpreted like this:

- `CRM_BASE`
  - customer records
  - contact info
  - basic history
  - basic customer detail page
  - booking, event, and class relation visibility
  - basic search
- `CRM_PRO`
  - import/export
  - segmentation
  - advanced filters
  - tags and future-ready customer classification
  - customer reactivation workflows
  - bulk customer operations
  - advanced customer history
  - spending and attendance summaries
  - interested leads management
  - campaign target lists
- `CRM_PRO + MENSAJERIA_PRO`
  - bulk WhatsApp or campaign sending
  - reactivation campaigns that actually send outbound messages
- `Unrelated`
  - booking creation itself
  - event/class operations outside customer visibility
  - storefront customization
  - metrics dashboards outside customer-specific CRM flows
