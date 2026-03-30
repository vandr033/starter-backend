import { Response } from 'express';
import multer from 'multer';
import { prisma } from '../prisma/client';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import { StorageService } from '../services/storage.service';

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed.'));
    }
  },
});

export const uploadImage = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = (req as any).companyID || parseInt(req.body.company_id);
    const { type, entity_id } = req.body;
    const entityId = entity_id ? parseInt(entity_id, 10) : null;
    
    if (!companyId) {
      return res.status(400).json({
        code: 400,
        error: true,
        message: 'Company ID is required',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        code: 400,
        error: true,
        message: 'No file uploaded',
      });
    }

    // Validate type
    const validTypes = [
      'logo',
      'hero_home',
      'hero_about',
      'about_1',
      'about_2',
      'about_3',
      'staff',
      'group_event_cover',
      'group_event_thumbnail',
      'group_class_cover',
      'group_class_thumbnail',
    ];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        code: 400,
        error: true,
        message: 'Invalid upload type',
      });
    }

    const typeRequiresEntityId = type === 'staff'
      || type === 'group_event_cover'
      || type === 'group_event_thumbnail'
      || type === 'group_class_cover'
      || type === 'group_class_thumbnail';

    // For staff and group item image types, entity_id is required
    if (typeRequiresEntityId && !entityId) {
      return res.status(400).json({
        code: 400,
        error: true,
        message: 'Entity ID is required for this upload type',
      });
    }

    // Get file extension
    const fileExtension = req.file.originalname.split('.').pop()?.toLowerCase();
    if (!fileExtension) {
      return res.status(400).json({
        code: 400,
        error: true,
        message: 'Invalid file extension',
      });
    }

    // Determine storage type and filename
    let storageType: 'logo' | 'hero' | 'about' | 'staff' | 'gallery' | 'group-events' | 'group-classes';
    let filename: string;
    let imageUrlField: string;

    switch (type) {
      case 'logo':
        storageType = 'logo';
        filename = `logo.${fileExtension}`;
        imageUrlField = 'logo_url';
        break;
      case 'hero_home':
        storageType = 'hero';
        filename = `home.${fileExtension}`;
        imageUrlField = 'home_hero_image_url';
        break;
      case 'hero_about':
        storageType = 'hero';
        filename = `about.${fileExtension}`;
        imageUrlField = 'about_hero_image_url';
        break;
      case 'about_1':
      case 'about_2':
      case 'about_3':
        storageType = 'about';
        const imageNumber = type.split('_')[1];
        filename = `image${imageNumber}.${fileExtension}`;
        imageUrlField = `about_image_${imageNumber}_url`;
        break;
      case 'staff':
        storageType = 'staff';
        filename = `${entityId}.${fileExtension}`;
        imageUrlField = 'image_url';
        break;
      case 'group_event_cover':
        storageType = 'group-events';
        filename = `${entityId}-cover.${fileExtension}`;
        imageUrlField = 'cover_image_url';
        break;
      case 'group_event_thumbnail':
        storageType = 'group-events';
        filename = `${entityId}-thumbnail.${fileExtension}`;
        imageUrlField = 'thumbnail_url';
        break;
      case 'group_class_cover':
        storageType = 'group-classes';
        filename = `${entityId}-cover.${fileExtension}`;
        imageUrlField = 'cover_image_url';
        break;
      case 'group_class_thumbnail':
        storageType = 'group-classes';
        filename = `${entityId}-thumbnail.${fileExtension}`;
        imageUrlField = 'thumbnail_url';
        break;
      default:
        return res.status(400).json({
          code: 400,
          error: true,
          message: 'Invalid upload type',
        });
    }

    // Save file using StorageService
    const relativePath = await StorageService.saveFile(
      companyId,
      storageType,
      filename,
      req.file.buffer
    );

    // Get the serving URL
    const url = StorageService.getFileUrl(relativePath);

    // Update database record
    if (type === 'staff') {
      // Update staff profile
      const updated = await prisma.staffProfile.updateMany({
        where: { id: entityId!, company_id: companyId },
        data: { image_url: url },
      });
      if (updated.count === 0) {
        await StorageService.deleteFile(relativePath).catch(() => undefined);
        return res.status(404).json({
          code: 404,
          error: true,
          message: 'Staff profile not found',
        });
      }
    } else if (type === 'group_event_cover' || type === 'group_event_thumbnail') {
      const updated = await prisma.groupEvent.updateMany({
        where: { id: entityId!, company_id: companyId },
        data: { [imageUrlField]: url } as any,
      });
      if (updated.count === 0) {
        await StorageService.deleteFile(relativePath).catch(() => undefined);
        return res.status(404).json({
          code: 404,
          error: true,
          message: 'Group event not found',
        });
      }
    } else if (type === 'group_class_cover' || type === 'group_class_thumbnail') {
      const updated = await prisma.groupClass.updateMany({
        where: { id: entityId!, company_id: companyId },
        data: { [imageUrlField]: url } as any,
      });
      if (updated.count === 0) {
        await StorageService.deleteFile(relativePath).catch(() => undefined);
        return res.status(404).json({
          code: 404,
          error: true,
          message: 'Group class not found',
        });
      }
    } else {
      // Update company record
      const updateData: any = {};
      updateData[imageUrlField] = url;
      
      await prisma.company.update({
        where: { id: companyId },
        data: updateData,
      });
    }

    res.json({
      code: 200,
      error: false,
      message: 'Image uploaded successfully',
      data: {
        url,
        type,
      },
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({
      code: 500,
      error: true,
      message: 'Failed to upload image',
    });
  }
};

// Export the upload middleware to be used in routes
export const uploadMiddleware = upload.single('file');

export const deleteImage = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = (req as any).companyID || parseInt(req.body.company_id);
    const { type, entity_id } = req.body;
    const entityId = entity_id ? parseInt(entity_id, 10) : null;
    
    if (!companyId) {
      return res.status(400).json({
        code: 400,
        error: true,
        message: 'Company ID is required',
      });
    }

    // Validate type
    const validTypes = [
      'logo',
      'hero_home',
      'hero_about',
      'about_1',
      'about_2',
      'about_3',
      'staff',
      'group_event_cover',
      'group_event_thumbnail',
      'group_class_cover',
      'group_class_thumbnail',
    ];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        code: 400,
        error: true,
        message: 'Invalid delete type',
      });
    }

    const typeRequiresEntityId = type === 'staff'
      || type === 'group_event_cover'
      || type === 'group_event_thumbnail'
      || type === 'group_class_cover'
      || type === 'group_class_thumbnail';

    // For staff and group item image types, entity_id is required
    if (typeRequiresEntityId && !entityId) {
      return res.status(400).json({
        code: 400,
        error: true,
        message: 'Entity ID is required for this delete type',
      });
    }

    // Determine storage type and get current image URL from database
    let storageType: 'logo' | 'hero' | 'about' | 'staff' | 'gallery' | 'group-events' | 'group-classes';
    let imageUrlField: string = '';

    // First, get the current image URL from database
    let currentRecord: any;
    
    if (type === 'staff') {
      currentRecord = await prisma.staffProfile.findUnique({
        where: { id: entityId! },
        select: { image_url: true, company_id: true },
      });
      
      if (!currentRecord || currentRecord.company_id !== companyId) {
        return res.status(404).json({
          code: 404,
          error: true,
          message: 'Staff profile not found',
        });
      }
    } else if (type === 'group_event_cover' || type === 'group_event_thumbnail') {
      currentRecord = await prisma.groupEvent.findFirst({
        where: { id: entityId!, company_id: companyId },
        select: {
          cover_image_url: true,
          thumbnail_url: true,
        },
      });

      if (!currentRecord) {
        return res.status(404).json({
          code: 404,
          error: true,
          message: 'Group event not found',
        });
      }
    } else if (type === 'group_class_cover' || type === 'group_class_thumbnail') {
      currentRecord = await prisma.groupClass.findFirst({
        where: { id: entityId!, company_id: companyId },
        select: {
          cover_image_url: true,
          thumbnail_url: true,
        },
      });

      if (!currentRecord) {
        return res.status(404).json({
          code: 404,
          error: true,
          message: 'Group class not found',
        });
      }
    } else {
      currentRecord = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          logo_url: true,
          home_hero_image_url: true,
          about_hero_image_url: true,
          about_image_1_url: true,
          about_image_2_url: true,
          about_image_3_url: true,
        },
      });
      
      if (!currentRecord) {
        return res.status(404).json({
          code: 404,
          error: true,
          message: 'Company not found',
        });
      }
    }

    // Get the current image URL
    let currentImageUrl: string | null = null;
    
    switch (type) {
      case 'logo':
        currentImageUrl = currentRecord.logo_url;
        storageType = 'logo';
        imageUrlField = 'logo_url';
        break;
      case 'hero_home':
        currentImageUrl = currentRecord.home_hero_image_url;
        storageType = 'hero';
        imageUrlField = 'home_hero_image_url';
        break;
      case 'hero_about':
        currentImageUrl = currentRecord.about_hero_image_url;
        storageType = 'hero';
        imageUrlField = 'about_hero_image_url';
        break;
      case 'about_1':
        currentImageUrl = currentRecord.about_image_1_url;
        storageType = 'about';
        imageUrlField = 'about_image_1_url';
        break;
      case 'about_2':
        currentImageUrl = currentRecord.about_image_2_url;
        storageType = 'about';
        imageUrlField = 'about_image_2_url';
        break;
      case 'about_3':
        currentImageUrl = currentRecord.about_image_3_url;
        storageType = 'about';
        imageUrlField = 'about_image_3_url';
        break;
      case 'staff':
        currentImageUrl = currentRecord.image_url;
        storageType = 'staff';
        imageUrlField = 'image_url';
        break;
      case 'group_event_cover':
        currentImageUrl = currentRecord.cover_image_url;
        storageType = 'group-events';
        imageUrlField = 'cover_image_url';
        break;
      case 'group_event_thumbnail':
        currentImageUrl = currentRecord.thumbnail_url;
        storageType = 'group-events';
        imageUrlField = 'thumbnail_url';
        break;
      case 'group_class_cover':
        currentImageUrl = currentRecord.cover_image_url;
        storageType = 'group-classes';
        imageUrlField = 'cover_image_url';
        break;
      case 'group_class_thumbnail':
        currentImageUrl = currentRecord.thumbnail_url;
        storageType = 'group-classes';
        imageUrlField = 'thumbnail_url';
        break;
    }

    // If no image URL exists, return success (nothing to delete)
    if (!currentImageUrl) {
      return res.json({
        code: 200,
        error: false,
        message: 'No image to delete',
      });
    }

    // Extract relative path from URL
    // URL format: /api/storage/uploads/{company_id}/{type}/{filename}
    const relativePath = currentImageUrl.includes('/api/storage/')
      ? currentImageUrl.split('/api/storage/')[1]
      : currentImageUrl.split('/').slice(3).join('/'); // Remove /api/storage/

    // Delete file from filesystem
    try {
      await StorageService.deleteFile(relativePath);
    } catch (error) {
      console.error('Error deleting file:', error);
      // Continue with database update even if file deletion fails
    }

    // Update database record to set image_url = null
    if (type === 'staff') {
      await prisma.staffProfile.update({
        where: { id: entityId! },
        data: { image_url: null },
      });
    } else if (type === 'group_event_cover' || type === 'group_event_thumbnail') {
      await prisma.groupEvent.updateMany({
        where: { id: entityId!, company_id: companyId },
        data: { [imageUrlField]: null } as any,
      });
    } else if (type === 'group_class_cover' || type === 'group_class_thumbnail') {
      await prisma.groupClass.updateMany({
        where: { id: entityId!, company_id: companyId },
        data: { [imageUrlField]: null } as any,
      });
    } else {
      const updateData: any = {};
      updateData[imageUrlField] = null;
      
      await prisma.company.update({
        where: { id: companyId },
        data: updateData,
      });
    }

    res.json({
      code: 200,
      error: false,
      message: 'Image deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({
      code: 500,
      error: true,
      message: 'Failed to delete image',
    });
  }
};
