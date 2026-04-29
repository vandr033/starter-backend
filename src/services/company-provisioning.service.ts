import type { Prisma } from '@prisma/client';
import { CompanyUserRole, StaffProfileStatus } from '@prisma/client';
import { ensureDefaultStaffAvailabilityFromCompanyHours } from './staff-availability-defaults.service';

const DEFAULT_LANGUAGE_KEY = 'default_language';
const DEFAULT_LANGUAGE_VALUE: 'es' | 'en' = 'es';
const DEFAULT_LANGUAGE_LABEL = 'Default Language';
const DEFAULT_LANGUAGE_DESCRIPTION = 'Default language for customer communications';

function buildDefaultHours(companyId: number) {
    return Array.from({ length: 7 }, (_, dayOfWeek) => ({
        company_id: companyId,
        day_of_week: dayOfWeek,
        is_closed: true,
    }));
}

export async function createCompanyWithDefaults(params: {
    tx: Prisma.TransactionClient;
    data: {
        name: string;
        slug: string;
        address?: string | null;
        phone_prefix?: string | null;
        phone: string;
        email?: string | null;
        city?: string | null;
        state?: string | null;
        country_code?: string | null;
        timezone?: string | null;
        currency: string;
        latitude?: number | null;
        longitude?: number | null;
        company_type_id: number;
        plan: 'STARTER' | 'BUSINESS' | 'PRO';
        billingCycle: 'MONTHLY' | 'YEARLY';
        pricePaid?: number | null;
        availableUntil: Date;
        isMarketplaceVisible: boolean;
    };
}) {
    const companyCreateData: Prisma.CompanyCreateInput = {
        name: params.data.name,
        slug: params.data.slug,
        address: params.data.address ?? undefined,
        phone_prefix: params.data.phone_prefix ?? undefined,
        phone: params.data.phone,
        email: params.data.email ?? undefined,
        city: params.data.city ?? undefined,
        state: params.data.state ?? undefined,
        country_code: params.data.country_code ?? undefined,
        timezone: params.data.timezone ?? 'America/La_Paz',
        currency: params.data.currency,
        latitude: params.data.latitude ?? undefined,
        longitude: params.data.longitude ?? undefined,
        plan: params.data.plan,
        billingCycle: params.data.billingCycle,
        pricePaid: params.data.pricePaid ?? undefined,
        availableUntil: params.data.availableUntil,
        isMarketplaceVisible: params.data.isMarketplaceVisible,
        company_type: {
            connect: {
                id: params.data.company_type_id,
            },
        },
        company_settings: {
            create: {
                booking_buffer_minutes: 10,
                booking_time_granularity_minutes: 5,
                cancel_limit_minutes: 120,
                reschedule_limit_minutes: 120,
                allow_qr_payment: true,
                allow_cash_payment: true,
                send_email_notifications: true,
                send_whatsapp_notifications: false,
            },
        },
        theme_config: {
            create: {
                brand_color: '#000000',
                page_background_color: '#ffffff',
                page_background_preset: 'light',
                cards_elevated: true,
                corner_radius: 'md',
            },
        },
    };

    const company = await params.tx.company.create({
        data: companyCreateData,
    });

    await params.tx.hours.createMany({
        data: buildDefaultHours(company.id),
    });

    await params.tx.configMessage.upsert({
        where: {
            company_id_key: {
                company_id: company.id,
                key: DEFAULT_LANGUAGE_KEY,
            },
        },
        update: {
            value: DEFAULT_LANGUAGE_VALUE,
            name: DEFAULT_LANGUAGE_LABEL,
            description: DEFAULT_LANGUAGE_DESCRIPTION,
        },
        create: {
            company_id: company.id,
            key: DEFAULT_LANGUAGE_KEY,
            value: DEFAULT_LANGUAGE_VALUE,
            name: DEFAULT_LANGUAGE_LABEL,
            description: DEFAULT_LANGUAGE_DESCRIPTION,
        },
    });

    return params.tx.company.findUniqueOrThrow({
        where: { id: company.id },
        include: {
            company_type: {
                select: {
                    id: true,
                    name: true,
                    name_i18n: true,
                },
            },
        },
    });
}

export async function assignOwnerToCompany(params: {
    tx: Prisma.TransactionClient;
    companyId: number;
    userId: string;
    displayName: string;
    isBookable?: boolean;
}) {
    const companyUser = await params.tx.companyUser.upsert({
        where: {
            company_id_user_id_role: {
                company_id: params.companyId,
                user_id: params.userId,
                role: CompanyUserRole.OWNER,
            },
        },
        update: {
            deleted_at: null,
            is_primary_contact: true,
        },
        create: {
            company_id: params.companyId,
            user_id: params.userId,
            role: CompanyUserRole.OWNER,
            is_primary_contact: true,
        },
    });

    const existingStaffProfile = await params.tx.staffProfile.findFirst({
        where: {
            company_id: params.companyId,
            user_id: params.userId,
        },
    });

    const staffProfile = existingStaffProfile
        ? await params.tx.staffProfile.update({
              where: { id: existingStaffProfile.id },
              data: {
                  deleted_at: null,
                  status: StaffProfileStatus.ACTIVE,
                  display_name: params.displayName,
                  is_bookable: params.isBookable ?? false,
              },
          })
        : await params.tx.staffProfile.create({
              data: {
                  company_id: params.companyId,
                  user_id: params.userId,
                  display_name: params.displayName,
                  is_bookable: params.isBookable ?? false,
                  status: StaffProfileStatus.ACTIVE,
              },
          });

    await ensureDefaultStaffAvailabilityFromCompanyHours({
        companyId: params.companyId,
        staffId: staffProfile.id,
        db: params.tx,
    });

    return {
        companyUser,
        staffProfile,
    };
}
