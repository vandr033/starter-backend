import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ensureBusinessPricingDefaults } from "../src/services/business-pricing.service";

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = "sebastian.andradeg@outlook.com";
const SUPER_ADMIN_NAME = "Sebastian Andrade";
const SUPER_ADMIN_FIRST_NAME = "Sebastian";
const SUPER_ADMIN_LAST_NAME = "Andrade";
const SUPER_ADMIN_PHONE_PREFIX = "591";
const CREDENTIAL_PROVIDER_ID = "credential";

const GLOBAL_COMPANY_TYPES = [
    {
        key: "BARBER_SHOP",
        name: "Barber shop",
        name_i18n: { en: "Barber shop", es: "Barbería" },
        description: "Traditional and modern barber services (haircuts, beard, grooming).",
        description_i18n: {
            en: "Traditional and modern barber services (haircuts, beard, grooming).",
            es: "Servicios de barbería tradicionales y modernos (cortes, barba y grooming).",
        },
        icon_name: "scissors-line",
    },
    {
        key: "NAIL_SALON",
        name: "Nail salon",
        name_i18n: { en: "Nail salon", es: "Salón de uñas" },
        description: "Nail care, manicure and pedicure services.",
        description_i18n: {
            en: "Nail care, manicure and pedicure services.",
            es: "Servicios de cuidado de uñas, manicure y pedicure.",
        },
        icon_name: "nail-polish-line",
    },
] as const;

const GLOBAL_SERVICE_TYPES = [
    {
        key: "HAIRCUT_MENS",
        name: "Men's haircut",
        name_i18n: { en: "Men's haircut", es: "Corte masculino" },
        description: "Short to medium length haircuts for men.",
        description_i18n: {
            en: "Short to medium length haircuts for men.",
            es: "Cortes de cabello masculinos de longitud corta a media.",
        },
    },
    {
        key: "HAIRCUT_WOMENS",
        name: "Women's haircut",
        name_i18n: { en: "Women's haircut", es: "Corte femenino" },
        description: "Haircuts and styling for women.",
        description_i18n: {
            en: "Haircuts and styling for women.",
            es: "Cortes de cabello y peinados para mujeres.",
        },
    },
    {
        key: "BEARD_TRIM",
        name: "Beard trim",
        name_i18n: { en: "Beard trim", es: "Recorte de barba" },
        description: "Beard trim and shaping services.",
        description_i18n: {
            en: "Beard trim and shaping services.",
            es: "Servicios de recorte y perfilado de barba.",
        },
    },
    {
        key: "GEL_MANICURE",
        name: "Gel manicure",
        name_i18n: { en: "Gel manicure", es: "Manicure en gel" },
        description: "Long-lasting gel manicures.",
        description_i18n: {
            en: "Long-lasting gel manicures.",
            es: "Manicures en gel de larga duración.",
        },
    },
    {
        key: "SPA_PEDICURE",
        name: "Spa pedicure",
        name_i18n: { en: "Spa pedicure", es: "Pedicure spa" },
        description: "Foot spa and pedicure treatments.",
        description_i18n: {
            en: "Foot spa and pedicure treatments.",
            es: "Tratamientos de spa y pedicure para pies.",
        },
    },
] as const;

function toJsonMap(input: Record<string, string | null | undefined>): Prisma.JsonObject {
    const entries = Object.entries(input).filter(([, value]) => typeof value === "string" && value.trim().length > 0);
    return Object.fromEntries(entries) as Prisma.JsonObject;
}

// Override with env when needed:
// SUPER_ADMIN_PASSWORD='your-secure-password' npm run prisma:seed:super-admin
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "ChangeMe123!";

async function main() {
    const now = new Date();
    const normalizedEmail = SUPER_ADMIN_EMAIL.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);

    await ensureBusinessPricingDefaults(prisma as any);

    // Upsert user by unique email
    const user = await prisma.user.upsert({
        where: { email: normalizedEmail },
        update: {
            name: SUPER_ADMIN_NAME,
            first_name: SUPER_ADMIN_FIRST_NAME,
            last_name: SUPER_ADMIN_LAST_NAME,
            is_super_admin: true,
            is_active: true,
            emailVerified: true,
            deleted_at: null,
            updatedAt: now,
        },
        create: {
            email: normalizedEmail,
            name: SUPER_ADMIN_NAME,
            first_name: SUPER_ADMIN_FIRST_NAME,
            last_name: SUPER_ADMIN_LAST_NAME,
            phone_prefix: SUPER_ADMIN_PHONE_PREFIX,
            is_super_admin: true,
            is_active: true,
            emailVerified: true,
            phoneNumberVerified: false,
            createdAt: now,
            updatedAt: now,
        },
    });

    // Normalize credentials account for this email (avoid duplicates from repeated runs)
    const existingAccounts = await prisma.account.findMany({
        where: {
            providerId: { in: [CREDENTIAL_PROVIDER_ID, "credentials"] },
            accountId: normalizedEmail,
        },
        orderBy: { createdAt: "asc" },
    });

    const primaryAccount =
        existingAccounts.find((a) => a.providerId === CREDENTIAL_PROVIDER_ID) || existingAccounts[0];

    if (primaryAccount) {
        await prisma.account.update({
            where: { id: primaryAccount.id },
            data: {
                providerId: CREDENTIAL_PROVIDER_ID,
                accountId: normalizedEmail,
                userId: user.id,
                password: hashedPassword,
                updatedAt: now,
            },
        });

        if (existingAccounts.length > 1) {
            await prisma.account.deleteMany({
                where: {
                    providerId: { in: [CREDENTIAL_PROVIDER_ID, "credentials"] },
                    accountId: normalizedEmail,
                    id: { not: primaryAccount.id },
                },
            });
        }
    } else {
        await prisma.account.create({
            data: {
                accountId: normalizedEmail,
                providerId: CREDENTIAL_PROVIDER_ID,
                userId: user.id,
                password: hashedPassword,
                accessToken: null,
                refreshToken: null,
                idToken: null,
                accessTokenExpiresAt: null,
                refreshTokenExpiresAt: null,
                scope: null,
                createdAt: now,
                updatedAt: now,
            },
        });
    }

    for (const companyType of GLOBAL_COMPANY_TYPES) {
        await prisma.companyType.upsert({
            where: { key: companyType.key },
            update: {
                name: companyType.name,
                name_i18n: toJsonMap(companyType.name_i18n),
                description: companyType.description,
                description_i18n: toJsonMap(companyType.description_i18n),
                icon_name: companyType.icon_name,
                is_active: true,
            },
            create: {
                key: companyType.key,
                name: companyType.name,
                name_i18n: toJsonMap(companyType.name_i18n),
                description: companyType.description,
                description_i18n: toJsonMap(companyType.description_i18n),
                icon_name: companyType.icon_name,
                is_active: true,
            },
        });
    }

    for (const serviceType of GLOBAL_SERVICE_TYPES) {
        await prisma.globalServiceType.upsert({
            where: { key: serviceType.key },
            update: {
                name: serviceType.name,
                name_i18n: toJsonMap(serviceType.name_i18n),
                description: serviceType.description,
                description_i18n: toJsonMap(serviceType.description_i18n),
            },
            create: {
                key: serviceType.key,
                name: serviceType.name,
                name_i18n: toJsonMap(serviceType.name_i18n),
                description: serviceType.description,
                description_i18n: toJsonMap(serviceType.description_i18n),
            },
        });
    }

    console.log("Super admin seed completed.");
    console.log(`Email: ${normalizedEmail}`);
    console.log(`Password: ${SUPER_ADMIN_PASSWORD}`);
    console.log(`Global company types seeded: ${GLOBAL_COMPANY_TYPES.length}`);
    console.log(`Global service types seeded: ${GLOBAL_SERVICE_TYPES.length}`);
    console.log("No companies/shops were seeded by this script.");
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
