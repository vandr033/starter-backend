import { Request, Response } from 'express';
import { prisma } from '../prisma/client';
import { AuthenticatedRequest } from '../middlewares/requireAuth';

export const getCategories = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawCompanyId = (req as any).companyID || req.query.company_id;
    const companyId = typeof rawCompanyId === 'string' ? parseInt(rawCompanyId, 10) : rawCompanyId;

    const categories = await prisma.category.findMany({
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
        } as any,
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
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
    });
  }
};

export const createCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = (req as any).companyID;
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
      const serviceType = await prisma.globalServiceType.findUnique({
        where: { id: global_service_type_id },
      });

      if (!serviceType) {
        return res.status(400).json({
          success: false,
          message: 'Invalid global service type ID',
        });
      }
    }

    // Check if slug already exists for this company
    const existingCategory = await prisma.category.findFirst({
      where: {
        company_id: companyId,
        slug,
        deleted_at: null,
      },
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Category with this slug already exists',
      });
    }

    const category = await prisma.category.create({
      data: {
        company_id: companyId,
        name,
        slug,
        description,
        global_service_type_id,
        position,
      } as any,
      include: {
        global_service_type: {
          select: {
            id: true,
            key: true,
            name: true,
          },
        } as any,
      },
    });

    res.status(201).json({
      success: true,
      data: category,
    });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create category',
    });
  }
};

export const updateCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = (req as any).companyID;
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
    const existingCategory = await prisma.category.findFirst({
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
      const serviceType = await prisma.globalServiceType.findUnique({
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

    // If updating slug, check if it's already taken by another category
    if (newSlug && newSlug !== existingCategory.slug) {
      const slugTaken = await prisma.category.findFirst({
        where: {
          company_id: companyId,
          slug: newSlug,
          deleted_at: null,
          id: { not: categoryId },
        },
      });

      if (slugTaken) {
        return res.status(400).json({
          success: false,
          message: 'Category with this slug already exists',
        });
      }
    }

    const category = await prisma.category.update({
      where: { id: categoryId },
      data: {
        name: name !== undefined ? name : existingCategory.name,
        slug: newSlug !== undefined ? newSlug : existingCategory.slug,
        description: description !== undefined ? description : existingCategory.description,
        position: position !== undefined ? position : existingCategory.position,
        is_active: is_active !== undefined ? is_active : existingCategory.is_active,
        global_service_type_id: global_service_type_id !== undefined ? global_service_type_id : (existingCategory as any).global_service_type_id,
      } as any,
      include: {
        global_service_type: {
          select: {
            id: true,
            key: true,
            name: true,
          },
        } as any,
      },
    });

    res.json({
      success: true,
      data: category,
    });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update category',
    });
  }
};

export const deleteCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = (req as any).companyID;
    const { id } = req.params;
    const categoryId = parseInt(Array.isArray(id) ? id[0] : id, 10);

    if (isNaN(categoryId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID',
      });
    }

    // Check if category exists and belongs to the user's company
    const existingCategory = await prisma.category.findFirst({
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

    // Check if category has services
    if (existingCategory._count.services > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with associated services. Please delete or reassign the services first.',
      });
    }

    // Soft delete the category
    await prisma.category.update({
      where: { id: categoryId },
      data: {
        deleted_at: new Date(),
      },
    });

    res.json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete category',
    });
  }
};

export const getGlobalServiceTypes = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const serviceTypes = await prisma.globalServiceType.findMany({
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

    res.json({
      success: true,
      data: serviceTypes,
    });
  } catch (error) {
    console.error('Error fetching global service types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch global service types',
    });
  }
};
