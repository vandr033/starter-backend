"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGlobalServiceTypes = exports.deleteCategory = exports.updateCategory = exports.createCategory = exports.getCategories = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const getCategories = async (req, res) => {
    try {
        const rawCompanyId = req.companyID || req.query.company_id;
        const companyId = typeof rawCompanyId === 'string' ? parseInt(rawCompanyId, 10) : rawCompanyId;
        const categories = await client_2.prisma.category.findMany({
            where: {
                company_id: companyId,
                deleted_at: null,
            },
            orderBy: [
                { position: 'asc' },
                { name: 'asc' },
            ],
            include: {
                global_service_type: {
                    select: {
                        id: true,
                        key: true,
                        name: true,
                    },
                },
                _count: {
                    select: {
                        services: {
                            where: {
                                deleted_at: null,
                                is_active: true,
                            },
                        },
                    },
                },
            },
        });
        res.json({
            success: true,
            data: categories,
        });
    }
    catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch categories',
        });
    }
};
exports.getCategories = getCategories;
const createCategory = async (req, res) => {
    try {
        const companyId = req.companyID;
        const { name, description, global_service_type_id, position = 0 } = req.body;
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Name is required',
            });
        }
        // Auto-generate slug from name
        const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
        // Validate global_service_type_id if provided
        if (global_service_type_id) {
            const serviceType = await client_2.prisma.globalServiceType.findUnique({
                where: { id: global_service_type_id },
            });
            if (!serviceType) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid global service type ID',
                });
            }
        }
        // Check if slug already exists for this company (including soft-deleted),
        // because the DB has a unique constraint on (company_id, slug).
        const slugConflict = await client_2.prisma.category.findFirst({
            where: {
                company_id: companyId,
                slug,
            },
        });
        // If only a deleted category holds this slug, generate a unique variant.
        // If an active category holds it, reject the request.
        let finalSlug = slug;
        if (slugConflict) {
            if (!slugConflict.deleted_at) {
                return res.status(400).json({
                    success: false,
                    message: 'Category with this slug already exists',
                });
            }
            // Slug is taken by a deleted category — append a suffix to stay unique.
            let suffix = 1;
            while (true) {
                const candidate = `${slug}-${suffix}`;
                const taken = await client_2.prisma.category.findFirst({
                    where: { company_id: companyId, slug: candidate },
                });
                if (!taken) {
                    finalSlug = candidate;
                    break;
                }
                suffix++;
            }
        }
        const category = await client_2.prisma.category.create({
            data: {
                company_id: companyId,
                name,
                slug: finalSlug,
                description,
                global_service_type_id,
                position,
            },
            include: {
                global_service_type: {
                    select: {
                        id: true,
                        key: true,
                        name: true,
                    },
                },
            },
        });
        res.status(201).json({
            success: true,
            data: category,
        });
    }
    catch (error) {
        console.error('Error creating category:', error);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return res.status(400).json({
                success: false,
                message: 'Category with this name already exists',
            });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to create category',
        });
    }
};
exports.createCategory = createCategory;
const updateCategory = async (req, res) => {
    try {
        const companyId = req.companyID;
        const { id } = req.params;
        const categoryId = parseInt(Array.isArray(id) ? id[0] : id, 10);
        const { name, slug, description, position, is_active, global_service_type_id } = req.body;
        if (isNaN(categoryId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid category ID',
            });
        }
        // Check if category exists and belongs to the user's company
        const existingCategory = await client_2.prisma.category.findFirst({
            where: {
                id: categoryId,
                company_id: companyId,
                deleted_at: null,
            },
        });
        if (!existingCategory) {
            return res.status(404).json({
                success: false,
                message: 'Category not found',
            });
        }
        // Validate global_service_type_id if provided
        if (global_service_type_id !== undefined && global_service_type_id !== null) {
            const serviceType = await client_2.prisma.globalServiceType.findUnique({
                where: { id: global_service_type_id },
            });
            if (!serviceType) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid global service type ID',
                });
            }
        }
        // Generate slug from name if name is provided but slug is not
        let newSlug = slug;
        if (name && !slug) {
            newSlug = name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '');
        }
        // If updating slug, check if it's already taken by another category.
        // Must include soft-deleted rows because the DB unique constraint on
        // (company_id, slug) ignores deleted_at.
        if (newSlug && newSlug !== existingCategory.slug) {
            const slugConflict = await client_2.prisma.category.findFirst({
                where: {
                    company_id: companyId,
                    slug: newSlug,
                    id: { not: categoryId },
                },
            });
            if (slugConflict) {
                if (!slugConflict.deleted_at) {
                    return res.status(400).json({
                        success: false,
                        message: 'Category with this slug already exists',
                    });
                }
                // Conflict is only with a deleted category — find a unique variant.
                let suffix = 1;
                while (true) {
                    const candidate = `${newSlug}-${suffix}`;
                    const taken = await client_2.prisma.category.findFirst({
                        where: { company_id: companyId, slug: candidate, id: { not: categoryId } },
                    });
                    if (!taken) {
                        newSlug = candidate;
                        break;
                    }
                    suffix++;
                }
            }
        }
        const category = await client_2.prisma.category.update({
            where: { id: categoryId },
            data: {
                name: name !== undefined ? name : existingCategory.name,
                slug: newSlug !== undefined ? newSlug : existingCategory.slug,
                description: description !== undefined ? description : existingCategory.description,
                position: position !== undefined ? position : existingCategory.position,
                is_active: is_active !== undefined ? is_active : existingCategory.is_active,
                global_service_type_id: global_service_type_id !== undefined ? global_service_type_id : existingCategory.global_service_type_id,
            },
            include: {
                global_service_type: {
                    select: {
                        id: true,
                        key: true,
                        name: true,
                    },
                },
            },
        });
        res.json({
            success: true,
            data: category,
        });
    }
    catch (error) {
        console.error('Error updating category:', error);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return res.status(400).json({
                success: false,
                message: 'Category with this name already exists',
            });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to update category',
        });
    }
};
exports.updateCategory = updateCategory;
const deleteCategory = async (req, res) => {
    try {
        const companyId = req.companyID;
        const { id } = req.params;
        const categoryId = parseInt(Array.isArray(id) ? id[0] : id, 10);
        if (isNaN(categoryId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid category ID',
            });
        }
        // Check if category exists and belongs to the user's company
        const existingCategory = await client_2.prisma.category.findFirst({
            where: {
                id: categoryId,
                company_id: companyId,
                deleted_at: null,
            },
            include: {
                _count: {
                    select: {
                        services: {
                            where: {
                                deleted_at: null,
                            },
                        },
                        group_events: { where: { deleted_at: null } },
                        group_classes: { where: { deleted_at: null } },
                    },
                },
            },
        });
        if (!existingCategory) {
            return res.status(404).json({
                success: false,
                message: 'Category not found',
            });
        }
        if (existingCategory._count.services + existingCategory._count.group_events + existingCategory._count.group_classes > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete a category used by services, events, or classes. Please reassign them first.',
            });
        }
        // Soft delete the category
        await client_2.prisma.category.update({
            where: { id: categoryId },
            data: {
                deleted_at: new Date(),
            },
        });
        res.json({
            success: true,
            message: 'Category deleted successfully',
        });
    }
    catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete category',
        });
    }
};
exports.deleteCategory = deleteCategory;
const getGlobalServiceTypes = async (req, res) => {
    try {
        const serviceTypes = await client_2.prisma.globalServiceType.findMany({
            select: {
                id: true,
                key: true,
                name: true,
                name_i18n: true,
                description: true,
                description_i18n: true,
            },
            orderBy: {
                name: 'asc',
            },
        });
        res.json({
            success: true,
            data: serviceTypes,
        });
    }
    catch (error) {
        console.error('Error fetching global service types:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch global service types',
        });
    }
};
exports.getGlobalServiceTypes = getGlobalServiceTypes;
