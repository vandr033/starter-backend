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

  static getCompanyBookingProofPath(companyId: number): string {
    return path.join(this.getCompanyPath(companyId), 'booking-proofs');
  }

  static getCompanyGroupEventsPath(companyId: number): string {
    return path.join(this.getCompanyPath(companyId), 'group-events');
  }

  static getCompanyGroupClassesPath(companyId: number): string {
    return path.join(this.getCompanyPath(companyId), 'group-classes');
  }

  static getCompanyCommerceBannersPath(companyId: number): string {
    return path.join(this.getCompanyPath(companyId), 'commerce-banners');
  }

  static getCompanyCommerceProductsPath(companyId: number): string {
    return path.join(this.getCompanyPath(companyId), 'commerce-products');
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
    await fs.mkdir(this.getCompanyBookingProofPath(companyId), { recursive: true });
    await fs.mkdir(this.getCompanyGroupEventsPath(companyId), { recursive: true });
    await fs.mkdir(this.getCompanyGroupClassesPath(companyId), { recursive: true });
    await fs.mkdir(this.getCompanyCommerceBannersPath(companyId), { recursive: true });
    await fs.mkdir(this.getCompanyCommerceProductsPath(companyId), { recursive: true });
  }

  static async saveFile(
    companyId: number,
    type: 'logo' | 'hero' | 'about' | 'staff' | 'gallery' | 'qr' | 'booking-proofs' | 'group-events' | 'group-classes' | 'commerce-banners' | 'commerce-products',
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
      case 'booking-proofs':
        directory = this.getCompanyBookingProofPath(companyId);
        break;
      case 'group-events':
        directory = this.getCompanyGroupEventsPath(companyId);
        break;
      case 'group-classes':
        directory = this.getCompanyGroupClassesPath(companyId);
        break;
      case 'commerce-banners':
        directory = this.getCompanyCommerceBannersPath(companyId);
        break;
      case 'commerce-products':
        directory = this.getCompanyCommerceProductsPath(companyId);
        break;
      default:
        throw new Error(`Invalid storage type: ${type}`);
    }

    const filePath = path.join(directory, filename);
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
