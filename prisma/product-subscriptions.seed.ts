import {
  BillingCycle,
  Prisma,
  PrismaClient,
  CompanyProductSubscriptionStatus,
  ProductCode,
  ProductTierCode,
  ShopPlan,
} from '@prisma/client';
import {
  LEGACY_PLAN_BASE_PRODUCT_TIERS,
  LEGACY_PLAN_EXTRA_CAPABILITIES,
  PRODUCT_CATALOG_SEED,
  PRODUCT_TIER_CAPABILITY_SEED,
  PRODUCT_TIER_SEED,
  getProductTierDefinition,
  type ProductCapability,
} from '../src/config/product-entitlements';

type DbClient = PrismaClient | Prisma.TransactionClient;

type BackfillableCompany = {
  id: number;
  plan: ShopPlan;
  billingCycle: BillingCycle;
  pricePaid: Prisma.Decimal | null;
  currency: string;
  availableUntil: Date;
  created_at: Date;
};

export type LegacyBackfillBlueprint = {
  tierCodes: ProductTierCode[];
  capabilityOverrides: ProductCapability[];
};

export function getLegacyBackfillBlueprint(plan: ShopPlan): LegacyBackfillBlueprint {
  return {
    tierCodes: [...LEGACY_PLAN_BASE_PRODUCT_TIERS[plan]],
    capabilityOverrides: [...LEGACY_PLAN_EXTRA_CAPABILITIES[plan]],
  };
}

function resolveSubscriptionStatus(availableUntil: Date, now: Date): CompanyProductSubscriptionStatus {
  return availableUntil.getTime() >= now.getTime()
    ? CompanyProductSubscriptionStatus.ACTIVE
    : CompanyProductSubscriptionStatus.EXPIRED;
}

function getPrimaryBillableTierCode(plan: ShopPlan): ProductTierCode {
  const coreProductCodes = new Set<ProductCode>([
    ProductCode.RESERVAS,
    ProductCode.EVENTOS,
    ProductCode.CLASES,
  ]);

  return LEGACY_PLAN_BASE_PRODUCT_TIERS[plan].find((tierCode) =>
    coreProductCodes.has(getProductTierDefinition(tierCode).productCode),
  ) ?? LEGACY_PLAN_BASE_PRODUCT_TIERS[plan][0];
}

export function buildLegacyBackfillPayload(company: BackfillableCompany) {
  const blueprint = getLegacyBackfillBlueprint(company.plan);
  const primaryBillableTierCode = getPrimaryBillableTierCode(company.plan);
  const status = resolveSubscriptionStatus(company.availableUntil, new Date());

  return {
    subscriptions: blueprint.tierCodes.map((tierCode) => {
      const tier = getProductTierDefinition(tierCode);

      return {
        tierCode,
        productCode: tier.productCode,
        status,
        billingCycle: company.billingCycle,
        pricePaid: tierCode === primaryBillableTierCode ? company.pricePaid : null,
        currency: company.currency,
        startsAt: company.created_at,
        availableUntil: company.availableUntil,
      };
    }),
    overrides: blueprint.capabilityOverrides.map((capability) => ({
      capability,
      value: true,
      reason: `Legacy ${company.plan} bundle backfill`,
      expiresAt: null,
    })),
    historyEntry: {
      action: 'LEGACY_PLAN_BACKFILL',
      previousValue: {
        plan: company.plan,
        billingCycle: company.billingCycle,
        pricePaid: company.pricePaid?.toString() ?? null,
        currency: company.currency,
        availableUntil: company.availableUntil.toISOString(),
      },
      newValue: {
        tierCodes: blueprint.tierCodes,
        capabilityOverrides: blueprint.capabilityOverrides,
      },
      note: 'Backfilled modular subscriptions from legacy company plan fields.',
    },
  };
}

export async function seedProductCatalog(db: DbClient): Promise<void> {
  for (const product of PRODUCT_CATALOG_SEED) {
    await db.productCatalog.upsert({
      where: { code: product.code },
      update: {
        name: product.name,
        description: product.description,
        category: product.category,
        isCoreProduct: product.isCoreProduct,
        isAddon: product.isAddon,
        isActive: product.isActive,
        sortOrder: product.sortOrder,
      },
      create: product,
    });
  }

  const productRows = await db.productCatalog.findMany({
    select: {
      id: true,
      code: true,
    },
  });
  const productIdByCode = new Map(productRows.map((product) => [product.code, product.id]));

  for (const tier of PRODUCT_TIER_SEED) {
    const productId = productIdByCode.get(tier.productCode);

    if (!productId) {
      throw new Error(`Missing product id for tier ${tier.code}`);
    }

    await db.productTier.upsert({
      where: { code: tier.code },
      update: {
        productId,
        name: tier.name,
        description: tier.description,
        tierLevel: tier.tierLevel,
        isBase: tier.isBase,
        isPro: tier.isPro,
        isActive: tier.isActive,
        sortOrder: tier.sortOrder,
      },
      create: {
        productId,
        code: tier.code,
        name: tier.name,
        description: tier.description,
        tierLevel: tier.tierLevel,
        isBase: tier.isBase,
        isPro: tier.isPro,
        isActive: tier.isActive,
        sortOrder: tier.sortOrder,
      },
    });
  }

  const tierRows = await db.productTier.findMany({
    select: {
      id: true,
      code: true,
    },
  });
  const tierIdByCode = new Map(tierRows.map((tier) => [tier.code, tier.id]));

  for (const tier of tierRows) {
    await db.productTierCapability.deleteMany({
      where: { productTierId: tier.id },
    });
  }

  await db.productTierCapability.createMany({
    data: PRODUCT_TIER_CAPABILITY_SEED.map((row) => {
      const productTierId = tierIdByCode.get(row.productTierCode);

      if (!productTierId) {
        throw new Error(`Missing product tier id for capability seed ${row.productTierCode}`);
      }

      return {
        productTierId,
        capability: row.capability,
      };
    }),
    skipDuplicates: true,
  });
}

export async function backfillLegacyCompanySubscriptions(db: DbClient): Promise<void> {
  const [productRows, tierRows, companies] = await Promise.all([
    db.productCatalog.findMany({
      select: {
        id: true,
        code: true,
      },
    }),
    db.productTier.findMany({
      select: {
        id: true,
        code: true,
      },
    }),
    db.company.findMany({
      select: {
        id: true,
        plan: true,
        billingCycle: true,
        pricePaid: true,
        currency: true,
        availableUntil: true,
        created_at: true,
        _count: {
          select: {
            product_subscriptions: true,
          },
        },
      },
    }),
  ]);

  const productIdByCode = new Map(productRows.map((product) => [product.code, product.id]));
  const tierIdByCode = new Map(tierRows.map((tier) => [tier.code, tier.id]));

  for (const company of companies) {
    if (company._count.product_subscriptions > 0) {
      continue;
    }

    const payload = buildLegacyBackfillPayload(company);

    for (const subscription of payload.subscriptions) {
      const productId = productIdByCode.get(subscription.productCode);
      const productTierId = tierIdByCode.get(subscription.tierCode);

      if (!productId || !productTierId) {
        throw new Error(
          `Missing product catalog rows for company ${company.id} backfill tier ${subscription.tierCode}`,
        );
      }

      await db.companyProductSubscription.create({
        data: {
          companyId: company.id,
          productId,
          productTierId,
          status: subscription.status,
          billingCycle: subscription.billingCycle,
          pricePaid: subscription.pricePaid,
          currency: subscription.currency,
          startsAt: subscription.startsAt,
          availableUntil: subscription.availableUntil,
        },
      });
    }

    if (payload.overrides.length > 0) {
      await db.companyCapabilityOverride.createMany({
        data: payload.overrides.map((override) => ({
          companyId: company.id,
          capability: override.capability,
          value: override.value,
          reason: override.reason,
          expiresAt: override.expiresAt,
        })),
      });
    }

    await db.companyProductHistory.create({
      data: {
        companyId: company.id,
        action: payload.historyEntry.action,
        previousValue: payload.historyEntry.previousValue,
        newValue: payload.historyEntry.newValue,
        note: payload.historyEntry.note,
      },
    });
  }
}

export async function seedAndBackfillProductSubscriptions(db: DbClient): Promise<void> {
  await seedProductCatalog(db);
  await backfillLegacyCompanySubscriptions(db);
}
