import { promises as fs } from 'fs';
import path from 'path';
import { env } from '../config/env';

export class StorageService {
  private static getUploadsPath(): string {
    return path.join(env.storagePath, 'uploads');
  }

  private static getCompanyPath(companyId: number): string {
    return path.join(this.getUploadsPath(), companyId.toString());
  }

  static getCompanyLogoPath(companyId: number): string {
    return path.join(this.getCompanyPath(companyId), 'logo');
  }

  static getCompanyHeroPath(companyId: number): string {
    return path.join(this.getCompanyPath(companyId), 'hero');
  }

  static getCompanyAboutPath(companyId: number): string {
    return path.join(this.getCompanyPath(companyId), 'about');
  }

  static getCompanyStaffPath(companyId: number): string {
    return path.join(this.getCompanyPath(companyId), 'staff');
  }

  static getCompanyGalleryPath(companyId: number): string {
    return path.join(this.getCompanyPath(companyId), 'gallery');
  }

  static getCompanyQRPath(companyId: number): string {
    return path.join(this.getCompanyPath(companyId), 'qr');
  }

  static getCompanyCommerceStorePath(companyId: number): string {
    return path.join(this.getCompanyPath(companyId), 'commerce-store');
  }

  static getCompanyCommerceCategoriesPath(companyId: number): string {
    return path.join(this.getCompanyPath(companyId), 'commerce-categories');
  }

  static getCompanyCommerceProductsPath(companyId: number): string {
    return path.join(this.getCompanyPath(companyId), 'commerce-products');
  }

  static getCompanyCommercePaymentProofsPath(companyId: number): string {
    return path.join(this.getCompanyPath(companyId), 'commerce-payment-proofs');
  }

  static getCompanyGroupEventsPath(companyId: number): string {
    return path.join(this.getCompanyPath(companyId), 'group-events');
  }

  static getCompanyGroupClassesPath(companyId: number): string {
    return path.join(this.getCompanyPath(companyId), 'group-classes');
  }

  static async ensureCompanyDirectories(companyId: number): Promise<void> {
    const companyPath = this.getCompanyPath(companyId);
    
    await fs.mkdir(companyPath, { recursive: true });
    await fs.mkdir(this.getCompanyLogoPath(companyId), { recursive: true });
    await fs.mkdir(this.getCompanyHeroPath(companyId), { recursive: true });
    await fs.mkdir(this.getCompanyAboutPath(companyId), { recursive: true });
    await fs.mkdir(this.getCompanyStaffPath(companyId), { recursive: true });
    await fs.mkdir(this.getCompanyGalleryPath(companyId), { recursive: true });
    await fs.mkdir(this.getCompanyQRPath(companyId), { recursive: true });
    await fs.mkdir(this.getCompanyCommerceStorePath(companyId), { recursive: true });
    await fs.mkdir(this.getCompanyCommerceCategoriesPath(companyId), { recursive: true });
    await fs.mkdir(this.getCompanyCommerceProductsPath(companyId), { recursive: true });
    await fs.mkdir(this.getCompanyCommercePaymentProofsPath(companyId), { recursive: true });
    await fs.mkdir(this.getCompanyGroupEventsPath(companyId), { recursive: true });
    await fs.mkdir(this.getCompanyGroupClassesPath(companyId), { recursive: true });
  }

  static async saveFile(
    companyId: number,
    type:
      | 'logo'
      | 'hero'
      | 'about'
      | 'staff'
      | 'gallery'
      | 'qr'
      | 'commerce-store'
      | 'commerce-categories'
      | 'commerce-products'
      | 'commerce-payment-proofs'
      | 'group-events'
      | 'group-classes',
    filename: string,
    buffer: Buffer
  ): Promise<string> {
    await this.ensureCompanyDirectories(companyId);
    
    let directory: string;
    
    switch (type) {
      case 'logo':
        directory = this.getCompanyLogoPath(companyId);
        // Remove existing logo files
        try {
          const files = await fs.readdir(directory);
          for (const file of files) {
            if (file !== filename) {
              await fs.unlink(path.join(directory, file));
            }
          }
        } catch (error) {
          // Directory might not exist yet, but ensureCompanyDirectories handles that
        }
        break;
      case 'hero':
        directory = this.getCompanyHeroPath(companyId);
        break;
      case 'about':
        directory = this.getCompanyAboutPath(companyId);
        break;
      case 'staff':
        directory = this.getCompanyStaffPath(companyId);
        break;
      case 'gallery':
        directory = this.getCompanyGalleryPath(companyId);
        break;
      case 'qr':
        directory = this.getCompanyQRPath(companyId);
        break;
      case 'commerce-store':
        directory = this.getCompanyCommerceStorePath(companyId);
        break;
      case 'commerce-categories':
        directory = this.getCompanyCommerceCategoriesPath(companyId);
        break;
      case 'commerce-products':
        directory = this.getCompanyCommerceProductsPath(companyId);
        break;
      case 'commerce-payment-proofs':
        directory = this.getCompanyCommercePaymentProofsPath(companyId);
        break;
      case 'group-events':
        directory = this.getCompanyGroupEventsPath(companyId);
        break;
      case 'group-classes':
        directory = this.getCompanyGroupClassesPath(companyId);
        break;
      default:
        throw new Error(`Invalid storage type: ${type}`);
    }

    const filePath = path.join(directory, filename);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    
    // Return relative path from storage root
    return path.relative(env.storagePath, filePath);
  }

  static async deleteFile(relativePath: string): Promise<void> {
    const fullPath = path.join(env.storagePath, relativePath);
    try {
      await fs.unlink(fullPath);
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }

  static async fileExists(relativePath: string): Promise<boolean> {
    const fullPath = path.join(env.storagePath, relativePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  static getFileUrl(relativePath: string): string {
    return `/api/storage/${relativePath}`;
  }

  static toRelativeStoragePath(rawPathOrUrl: string): string | null {
    const normalized = rawPathOrUrl.trim();
    if (!normalized) return null;

    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      try {
        return this.toRelativeStoragePath(new URL(normalized).pathname);
      } catch {
        return null;
      }
    }

    const pathWithoutQuery = normalized.split(/[?#]/, 1)[0];
    if (!pathWithoutQuery) return null;

    if (pathWithoutQuery.startsWith('/api/storage/')) {
      return pathWithoutQuery.slice('/api/storage/'.length);
    }

    const uploadsIndex = pathWithoutQuery.indexOf('/uploads/');
    if (uploadsIndex >= 0) {
      return pathWithoutQuery.slice(uploadsIndex + 1);
    }

    if (pathWithoutQuery.startsWith('uploads/')) {
      return pathWithoutQuery;
    }

    return null;
  }

  static async getFilePath(relativePath: string): Promise<string> {
    const fullPath = path.join(env.storagePath, relativePath);
    
    // Check if file exists
    const exists = await this.fileExists(relativePath);
    if (!exists) {
      throw new Error('File not found');
    }
    
    return fullPath;
  }

  static getLogoFilename(companyId: number): string {
    return `logo.${companyId}`;
  }

  static getHomeHeroFilename(companyId: number): string {
    return `home.${companyId}`;
  }

  static getAboutHeroFilename(companyId: number): string {
    return `about.${companyId}`;
  }

  static getAboutImageFilename(companyId: number, imageNumber: 1 | 2 | 3): string {
    return `image${imageNumber}.${companyId}`;
  }

  static getStaffFilename(staffId: number): string {
    return `staff.${staffId}`;
  }
}
