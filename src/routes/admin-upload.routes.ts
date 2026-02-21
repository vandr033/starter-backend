import { Router } from 'express';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';
import { uploadImage, uploadMiddleware, deleteImage } from '../controllers/admin-upload.controller';

const router = Router();

const adminRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN];

// POST /api/admin/uploads/image - Upload an image
router.post(
  '/image',
  requireAuth,
  requireCompanyRole(adminRoles),
  uploadMiddleware,
  uploadImage
);

// DELETE /api/admin/uploads/image - Delete an image
router.delete(
  '/image',
  requireAuth,
  requireCompanyRole(adminRoles),
  deleteImage
);

export default router;
