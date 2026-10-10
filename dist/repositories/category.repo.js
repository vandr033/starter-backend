"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCategoriesByCompany = getCategoriesByCompany;
exports.getCategoryById = getCategoryById;
exports.isSlugUnique = isSlugUnique;
exports.getNextPosition = getNextPosition;
exports.createCategory = createCategory;
exports.updateCategory = updateCategory;
exports.getUpdatedCategory = getUpdatedCategory;
exports.softDeleteCategory = softDeleteCategory;
exports.getGlobalServiceTypeById = getGlobalServiceTypeById;
exports.getAllGlobalServiceTypes = getAllGlobalServiceTypes;
const client_1 = require("../prisma/client");
/**
 * Get all categories for a company
 */
async function getCategoriesByCompany(companyId) {
    return client_1.prisma.category.findMany({
        where: {
            company_id: companyId,
            deleted_at: null,
        },
        // TODO: Uncomment once database schema is updated
        // include: {
        //     global_service_type: {
        //         select: {
        //             id: true,
        //             key: true,
        //             name: true,
        //         },
        //     },
        // },
        orderBy: {
            position: 'asc',
        },
    });
}
/**
 * Get a single category by ID with ownership check
 */
async function getCategoryById(id, companyId) {
    return client_1.prisma.category.findFirst({
        where: {
            id,
            company_id: companyId,
            deleted_at: null,
        },
    });
}
/**
 * Check if slug is unique for the company
 */
async function isSlugUnique(slug, companyId, excludeId) {
    const category = await client_1.prisma.category.findFirst({
        where: {
            company_id: companyId,
            slug,
            deleted_at: null,
            ...(excludeId && { id: { not: excludeId } }),
        },
    });
    return !category;
}
/**
 * Get the next position for a category in a company
 */
async function getNextPosition(companyId) {
    const maxPosition = await client_1.prisma.category.aggregate({
        where: {
            company_id: companyId,
            deleted_at: null,
        },
        _max: {
            position: true,
        },
    });
    return (maxPosition._max.position ?? -1) + 1;
}
async function createCategory(data) {
    return client_1.prisma.category.create({
        data: {
            company_id: data.company_id,
            name: data.name,
            slug: data.slug,
            description: data.description,
            position: data.position ?? 0,
            // TODO: Uncomment once database schema is updated
            // global_service_type_id: data.global_service_type_id,
        },
    });
}
async function updateCategory(id, companyId, data) {
    return client_1.prisma.category.updateMany({
        where: {
            id,
            company_id: companyId,
            deleted_at: null,
        },
        data,
    });
}
/**
 * Get updated category after update
 */
async function getUpdatedCategory(id, companyId) {
    return client_1.prisma.category.findFirst({
        where: {
            id,
            company_id: companyId,
        },
    });
}
/**
 * Soft delete a category
 */
async function softDeleteCategory(id, companyId) {
    return client_1.prisma.category.updateMany({
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
/**
 * Get a global service type by ID
 */
async function getGlobalServiceTypeById(id) {
    return client_1.prisma.globalServiceType.findUnique({
        where: { id },
    });
}
/**
 * Get all global service types
 */
async function getAllGlobalServiceTypes() {
    return client_1.prisma.globalServiceType.findMany({
        select: {
            id: true,
            key: true,
            name: true,
            description: true,
        },
        orderBy: {
            name: 'asc',
        },
    });
}
