import { prisma } from '../prisma/client';

/**
 * Get all services for a company, ordered by category position then service position
 */
export async function getServicesByCompany(companyId: number) {
    return prisma.service.findMany({
        where: {
            company_id: companyId,
            deleted_at: null,
        },
        include: {
            category: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    position: true,
                },
            },
            required_resources: {
                where: {
                    staff_profile: {
                        deleted_at: null,
                    },
                },
                select: { staff_profile_id: true },
            },
        },
        orderBy: [
            { category: { position: 'asc' } },
            { position: 'asc' },
        ],
    });
}

/**
 * Get a single service by ID with ownership check
 */
export async function getServiceById(id: number, companyId: number) {
    return prisma.service.findFirst({
        where: {
            id,
            company_id: companyId,
            deleted_at: null,
        },
        include: {
            category: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                },
            },
            required_resources: {
                where: {
                    staff_profile: {
                        deleted_at: null,
                    },
                },
                select: { staff_profile_id: true },
            },
        },
    });
}

/**
 * Get category by ID with company ownership check
 */
export async function getCategoryById(categoryId: number, companyId: number) {
    return prisma.category.findFirst({
        where: {
            id: categoryId,
            company_id: companyId,
            deleted_at: null,
        },
    });
}

/**
 * Get the next position for a service in a category
 */
export async function getNextPosition(categoryId: number) {
    const maxPosition = await prisma.service.aggregate({
        where: {
            category_id: categoryId,
            deleted_at: null,
        },
        _max: {
            position: true,
        },
    });

    return (maxPosition._max.position ?? -1) + 1;
}

/**
 * Create a new service
 */
export interface CreateServiceData {
    company_id: number;
    category_id: number;
    name: string;
    description?: string;
    price_cents: number;
    promo_price_cents?: number | null;
    promo_starts_at?: Date | null;
    promo_ends_at?: Date | null;
    promo_label?: string | null;
    duration_minutes: number;
    is_multi_session?: boolean;
    session_count?: number | null;
    session_duration_minutes?: number | null;
    position?: number;
    global_type_id?: number;
    is_invite_only?: boolean;
    invite_token?: string | null;
}

export async function createService(data: CreateServiceData) {
    return prisma.service.create({
        data: {
            company_id: data.company_id,
            category_id: data.category_id,
            name: data.name,
            description: data.description,
            price_cents: data.price_cents,
            promo_price_cents: data.promo_price_cents ?? null,
            promo_starts_at: data.promo_starts_at ?? null,
            promo_ends_at: data.promo_ends_at ?? null,
            promo_label: data.promo_label ?? null,
            duration_minutes: data.duration_minutes,
            is_multi_session: data.is_multi_session ?? false,
            session_count: data.session_count ?? null,
            session_duration_minutes: data.session_duration_minutes ?? null,
            position: data.position ?? 0,
            global_type_id: data.global_type_id,
            is_invite_only: data.is_invite_only ?? false,
            invite_token: data.invite_token ?? null,
        },
        include: {
            category: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                },
            },
        },
    });
}

/**
 * Update a service
 */
export interface UpdateServiceData {
    name?: string;
    description?: string;
    price_cents?: number;
    promo_price_cents?: number | null;
    promo_starts_at?: Date | null;
    promo_ends_at?: Date | null;
    promo_label?: string | null;
    duration_minutes?: number;
    is_multi_session?: boolean;
    session_count?: number | null;
    session_duration_minutes?: number | null;
    position?: number;
    is_active?: boolean;
    category_id?: number;
    global_type_id?: number;
    is_invite_only?: boolean;
    invite_token?: string | null;
}

export async function updateService(id: number, companyId: number, data: UpdateServiceData) {
    return prisma.service.updateMany({
        where: {
            id,
            company_id: companyId,
            deleted_at: null,
        },
        data,
    });
}

/**
 * Get updated service after update
 */
export async function getUpdatedService(id: number, companyId: number) {
    return prisma.service.findFirst({
        where: {
            id,
            company_id: companyId,
        },
        include: {
            category: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                },
            },
            required_resources: {
                where: {
                    staff_profile: {
                        deleted_at: null,
                    },
                },
                select: { staff_profile_id: true },
            },
        },
    });
}

export async function getPublicInviteServiceByToken(
    slug: string,
    inviteToken: string,
) {
    return prisma.service.findFirst({
        where: {
            invite_token: inviteToken,
            is_invite_only: true,
            is_active: true,
            deleted_at: null,
            company: {
                slug,
                deleted_at: null,
            },
        },
        select: {
            id: true,
            category_id: true,
            name: true,
            description: true,
            price_cents: true,
            promo_price_cents: true,
            promo_starts_at: true,
            promo_ends_at: true,
            promo_label: true,
            duration_minutes: true,
            is_multi_session: true,
            session_count: true,
            session_duration_minutes: true,
            position: true,
            is_invite_only: true,
            required_resources: {
                where: {
                    staff_profile: {
                        deleted_at: null,
                    },
                },
                select: { staff_profile_id: true },
            },
            category: {
                select: {
                    id: true,
                    name: true,
                },
            },
            company: {
                select: {
                    id: true,
                    availableUntil: true,
                    is_active: true,
                    deleted_at: true,
                    isMarketplaceVisible: true,
                },
            },
        },
    });
}

/**
 * Replace required resources for a service (delete existing, insert new)
 */
export async function setServiceRequiredResources(
    serviceId: number,
    companyId: number,
    staffProfileIds: number[]
) {
    return prisma.$transaction([
        prisma.serviceRequiredResource.deleteMany({
            where: { service_id: serviceId, company_id: companyId },
        }),
        ...(staffProfileIds.length > 0
            ? [
                prisma.serviceRequiredResource.createMany({
                    data: staffProfileIds.map((id) => ({
                        service_id: serviceId,
                        company_id: companyId,
                        staff_profile_id: id,
                    })),
                    skipDuplicates: true,
                }),
            ]
            : []),
    ]);
}

/**
 * Soft delete a service
 */
export async function softDeleteService(id: number, companyId: number) {
    return prisma.service.updateMany({
        where: {
            id,
            company_id: companyId,
            deleted_at: null,
        },
        data: {
            deleted_at: new Date(),
        },
    });
}
