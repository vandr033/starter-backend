import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = "superadmin@gmail.com";
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
const SUPER_ADMIN_NAME = process.env.SUPER_ADMIN_NAME || "Super Admin";
const CREDENTIAL_PROVIDER_IDS = ["credential", "credentials"] as const;

async function main() {
    if (!SUPER_ADMIN_PASSWORD) {
        throw new Error(
            "SUPER_ADMIN_PASSWORD is required. Pass it through the environment when running this seeder.",
        );
    }

    if (SUPER_ADMIN_PASSWORD.length < 8) {
        throw new Error("SUPER_ADMIN_PASSWORD must contain at least 8 characters.");
    }

    const now = new Date();
    const normalizedEmail = SUPER_ADMIN_EMAIL.toLowerCase();
    const nameParts = SUPER_ADMIN_NAME.trim().split(/\s+/);
    const firstName = nameParts.shift() || "Super";
    const lastName = nameParts.join(" ") || "Admin";
    const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);

    const user = await prisma.user.upsert({
        where: { email: normalizedEmail },
        update: {
            name: SUPER_ADMIN_NAME,
            first_name: firstName,
            last_name: lastName,
            is_super_admin: true,
            is_active: true,
            emailVerified: true,
            must_change_password: false,
            deleted_at: null,
            updatedAt: now,
        },
        create: {
            email: normalizedEmail,
            name: SUPER_ADMIN_NAME,
            first_name: firstName,
            last_name: lastName,
            is_super_admin: true,
            is_active: true,
            emailVerified: true,
            must_change_password: false,
            createdAt: now,
            updatedAt: now,
        },
    });

    const credentialAccounts = await prisma.account.findMany({
        where: {
            userId: user.id,
            providerId: { in: [...CREDENTIAL_PROVIDER_IDS] },
        },
        orderBy: { createdAt: "asc" },
    });

    const primaryAccount =
        credentialAccounts.find((account) => account.providerId === "credential") ||
        credentialAccounts[0];

    if (primaryAccount) {
        await prisma.account.update({
            where: { id: primaryAccount.id },
            data: {
                providerId: "credential",
                accountId: normalizedEmail,
                password: hashedPassword,
                updatedAt: now,
            },
        });

        await prisma.account.deleteMany({
            where: {
                userId: user.id,
                providerId: { in: [...CREDENTIAL_PROVIDER_IDS] },
                id: { not: primaryAccount.id },
            },
        });
    } else {
        await prisma.account.create({
            data: {
                accountId: normalizedEmail,
                providerId: "credential",
                userId: user.id,
                password: hashedPassword,
            },
        });
    }

    console.log(`Super admin seeded: ${normalizedEmail}`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
