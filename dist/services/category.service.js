"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCategories = listCategories;
exports.createCategory = createCategory;
exports.updateCategory = updateCategory;
exports.deleteCategory = deleteCategory;
exports.getGlobalServiceTypes = getGlobalServiceTypes;
const CategoryRepo = __importStar(require("../repositories/category.repo"));
/**
 * Generate a slug from a name
 */
function generateSlug(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}
/**
 * List all categories for a company
 */
async function listCategories(companyId) {
    try {
        const categories = await CategoryRepo.getCategoriesByCompany(companyId);
        return {
            code: 200,
            message: 'Categories retrieved successfully',
            error: false,
            data: categories,
        };
    }
    catch (error) {
        console.error('Error listing categories:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
async function createCategory(companyId, input) {
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
    }
    catch (error) {
        console.error('Error creating category:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
async function updateCategory(companyId, categoryId, input) {
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
        let slug;
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
    }
    catch (error) {
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
async function deleteCategory(companyId, categoryId) {
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
    }
    catch (error) {
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
async function getGlobalServiceTypes() {
    try {
        const globalServiceTypes = await CategoryRepo.getAllGlobalServiceTypes();
        return {
            code: 200,
            message: 'Global service types retrieved successfully',
            error: false,
            data: globalServiceTypes,
        };
    }
    catch (error) {
        console.error('Error getting global service types:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
