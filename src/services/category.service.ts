import { MensajeApi } from '../types/MensajeApi';
import * as CategoryRepo from '../repositories/category.repo';

interface CategoryResult extends MensajeApi {
    data?: any;
}

/**
 * Generate a slug from a name
 */
function generateSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

/**
 * List all categories for a company
 */
export async function listCategories(companyId: number): Promise<CategoryResult> {
    try {
        const categories = await CategoryRepo.getCategoriesByCompany(companyId);

        return {
            code: 200,
            message: 'Categories retrieved successfully',
            error: false,
            data: categories,
        };
    } catch (error: any) {
        console.error('Error listing categories:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Create a new category
 */
export interface CreateCategoryInput {
    name: string;
    description?: string;
    position?: number;
    global_service_type_id?: number;
}

export async function createCategory(
    companyId: number,
    input: CreateCategoryInput
): Promise<CategoryResult> {
    try {
        // Validate name
        if (!input.name || input.name.trim().length === 0) {
            return {
                code: 400,
                message: 'Name is required',
                error: true,
            };
        }

        if (input.name.length > 191) {
            return {
                code: 400,
                message: 'Name must be less than 191 characters',
                error: true,
            };
        }

        // Generate slug
        const slug = generateSlug(input.name);

        // Check if slug is unique
        const isUnique = await CategoryRepo.isSlugUnique(slug, companyId);
        if (!isUnique) {
            return {
                code: 400,
                message: 'A category with this name already exists',
                error: true,
            };
        }

        // Auto-set position if not provided
        let position = input.position;
        if (position === undefined) {
            position = await CategoryRepo.getNextPosition(companyId);
        }

        // TODO: Uncomment once database schema is updated
        // // Validate global_service_type_id if provided
        // if (input.global_service_type_id) {
        //     const globalServiceTypeExists = await CategoryRepo.getGlobalServiceTypeById(input.global_service_type_id);
        //     if (!globalServiceTypeExists) {
        //         return {
        //             code: 400,
        //             message: 'Invalid global_service_type_id',
        //             error: true,
        //         };
        //     }
        // }

        const category = await CategoryRepo.createCategory({
            company_id: companyId,
            name: input.name.trim(),
            slug,
            description: input.description?.trim(),
            position,
            global_service_type_id: input.global_service_type_id,
        });

        return {
            code: 201,
            message: 'Category created successfully',
            error: false,
            data: category,
        };
    } catch (error: any) {
        console.error('Error creating category:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Update a category
 */
export interface UpdateCategoryInput {
    name?: string;
    description?: string;
    position?: number;
    is_active?: boolean;
    global_service_type_id?: number;
}

export async function updateCategory(
    companyId: number,
    categoryId: number,
    input: UpdateCategoryInput
): Promise<CategoryResult> {
    try {
        // Check if category exists and belongs to company
        const existing = await CategoryRepo.getCategoryById(categoryId, companyId);
        if (!existing) {
            return {
                code: 404,
                message: 'Category not found',
                error: true,
            };
        }

        // If updating name, validate and generate new slug
        let slug: string | undefined;
        if (input.name) {
            if (input.name.trim().length === 0) {
                return {
                    code: 400,
                    message: 'Name cannot be empty',
                    error: true,
                };
            }

            if (input.name.length > 191) {
                return {
                    code: 400,
                    message: 'Name must be less than 191 characters',
                    error: true,
                };
            }

            slug = generateSlug(input.name);

            // Check if new slug is unique
            const isUnique = await CategoryRepo.isSlugUnique(slug, companyId, categoryId);
            if (!isUnique) {
                return {
                    code: 400,
                    message: 'A category with this name already exists',
                    error: true,
                };
            }
        }

        // TODO: Uncomment once database schema is updated
        // // Validate global_service_type_id if provided
        // if (input.global_service_type_id) {
        //     const globalServiceTypeExists = await CategoryRepo.getGlobalServiceTypeById(input.global_service_type_id);
        //     if (!globalServiceTypeExists) {
        //         return {
        //             code: 400,
        //             message: 'Invalid global_service_type_id',
        //             error: true,
        //         };
        //     }
        // }

        await CategoryRepo.updateCategory(categoryId, companyId, {
            name: input.name?.trim(),
            slug,
            description: input.description?.trim(),
            position: input.position,
            is_active: input.is_active,
            global_service_type_id: input.global_service_type_id,
        });

        const updated = await CategoryRepo.getUpdatedCategory(categoryId, companyId);

        return {
            code: 200,
            message: 'Category updated successfully',
            error: false,
            data: updated,
        };
    } catch (error: any) {
        console.error('Error updating category:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Soft delete a category
 */
export async function deleteCategory(
    companyId: number,
    categoryId: number
): Promise<CategoryResult> {
    try {
        // Check if category exists
        const existing = await CategoryRepo.getCategoryById(categoryId, companyId);
        if (!existing) {
            return {
                code: 404,
                message: 'Category not found',
                error: true,
            };
        }

        const result = await CategoryRepo.softDeleteCategory(categoryId, companyId);

        if (result.count === 0) {
            return {
                code: 404,
                message: 'Category not found or already deleted',
                error: true,
            };
        }

        return {
            code: 200,
            message: 'Category deleted successfully',
            error: false,
        };
    } catch (error: any) {
        console.error('Error deleting category:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Get all global service types
 */
export async function getGlobalServiceTypes(): Promise<CategoryResult> {
    try {
        const globalServiceTypes = await CategoryRepo.getAllGlobalServiceTypes();

        return {
            code: 200,
            message: 'Global service types retrieved successfully',
            error: false,
            data: globalServiceTypes,
        };
    } catch (error: any) {
        console.error('Error getting global service types:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
