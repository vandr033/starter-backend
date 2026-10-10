"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getServicesByCompany = getServicesByCompany;
exports.getServiceById = getServiceById;
exports.getCategoryById = getCategoryById;
exports.getNextPosition = getNextPosition;
exports.createService = createService;
exports.updateService = updateService;
exports.getUpdatedService = getUpdatedService;
exports.getPublicInviteServiceByToken = getPublicInviteServiceByToken;
exports.setServiceRequiredResources = setServiceRequiredResources;
exports.softDeleteService = softDeleteService;
const client_1 = require("../prisma/client");
/**
 * Get all services for a company, ordered by category position then service position
 */
async function getServicesByCompany(companyId) {
    return client_1.prisma.service.findMany({
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
async function getServiceById(id, companyId) {
    return client_1.prisma.service.findFirst({
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
async function getCategoryById(categoryId, companyId) {
    return client_1.prisma.category.findFirst({
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
async function getNextPosition(categoryId) {
    const maxPosition = await client_1.prisma.service.aggregate({
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
async function createService(data) {
    return client_1.prisma.service.create({
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
            notify_customer: data.notify_customer ?? true,
            notify_assigned_staff: data.notify_assigned_staff ?? true,
            notify_management: data.notify_management ?? true,
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
async function updateService(id, companyId, data) {
    return client_1.prisma.service.updateMany({
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
async function getUpdatedService(id, companyId) {
    return client_1.prisma.service.findFirst({
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
async function getPublicInviteServiceByToken(slug, inviteToken) {
    return client_1.prisma.service.findFirst({
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
async function setServiceRequiredResources(serviceId, companyId, staffProfileIds) {
    return client_1.prisma.$transaction([
        client_1.prisma.serviceRequiredResource.deleteMany({
            where: { service_id: serviceId, company_id: companyId },
        }),
        ...(staffProfileIds.length > 0
            ? [
                client_1.prisma.serviceRequiredResource.createMany({
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
async function softDeleteService(id, companyId) {
    return client_1.prisma.service.updateMany({
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
