import { promises as fs } from 'fs';
import path from 'path';
import { env } from '../config/env';

export class StorageService {
  private static safeCompanyId(companyId: number): string {
    if (!Number.isInteger(companyId) || companyId <= 0) throw new Error('Invalid company id');
    return String(companyId);
  }

  private static safeFilename(filename: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,190}$/.test(filename) || filename === '.' || filename === '..') throw new Error('Invalid filename');
    return filename;
  }

  private static safeFilenamePath(filename: string): string {
    const normalized = filename.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    const segments = normalized.split('/');
    if (!normalized || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
      throw new Error('Invalid filename');
    }
    return segments.map((segment) => this.safeFilename(segment)).join('/');
  }

  private static safeRelativePath(relativePath: string): { normalized: string; fullPath: string } {
    const normalized = relativePath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized || !normalized.startsWith('uploads/') || normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')) throw new Error('Invalid storage path');
    const storageRoot = path.resolve(env.storagePath);
    const fullPath = path.resolve(storageRoot, normalized);
    if (fullPath !== storageRoot && !fullPath.startsWith(`${storageRoot}${path.sep}`)) throw new Error('Invalid storage path');
    return { normalized, fullPath };
  }

  private static getUploadsPath(): string {
    return path.join(env.storagePath, 'uploads');
  }

  private static getCompanyPath(companyId: number): string {
    return path.join(this.getUploadsPath(), this.safeCompanyId(companyId));
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

  static getCompanyRestaurantMenuPath(companyId: number, kind: 'items' | 'categories'): string {
    return path.join(this.getCompanyPath(companyId), 'restaurant-menu', kind);
  }

  static getCompanyRestaurantDepositProofsPath(companyId: number): string {
    return path.join(this.getCompanyPath(companyId), 'restaurant-deposit-proofs');
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
    await fs.mkdir(this.getCompanyRestaurantMenuPath(companyId, 'items'), { recursive: true });
    await fs.mkdir(this.getCompanyRestaurantMenuPath(companyId, 'categories'), { recursive: true });
    await fs.mkdir(this.getCompanyRestaurantDepositProofsPath(companyId), { recursive: true });
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
      | 'group-classes'
      | 'restaurant-menu-items'
      | 'restaurant-menu-categories'
      | 'restaurant-deposit-proofs',
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
      case 'restaurant-menu-items':
        directory = this.getCompanyRestaurantMenuPath(companyId, 'items');
        break;
      case 'restaurant-menu-categories':
        directory = this.getCompanyRestaurantMenuPath(companyId, 'categories');
        break;
      case 'restaurant-deposit-proofs':
        directory = this.getCompanyRestaurantDepositProofsPath(companyId);
        break;
      default:
        throw new Error(`Invalid storage type: ${type}`);
    }

    const safeFilename = this.safeFilenamePath(filename);
    const filePath = path.join(directory, safeFilename);
    const resolvedDirectory = path.resolve(directory);
    const resolvedFilePath = path.resolve(filePath);
    if (!resolvedFilePath.startsWith(`${resolvedDirectory}${path.sep}`)) throw new Error('Invalid storage filename');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    
    // Return relative path from storage root
    return path.relative(env.storagePath, filePath);
  }

  static async deleteFile(relativePath: string): Promise<void> {
    const { fullPath } = this.safeRelativePath(relativePath);
    try {
      await fs.unlink(fullPath);
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }

  static async fileExists(relativePath: string): Promise<boolean> {
    let fullPath: string;
    try { fullPath = this.safeRelativePath(relativePath).fullPath; } catch { return false; }
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  static getFileUrl(relativePath: string): string {
    const { normalized } = this.safeRelativePath(relativePath);
    if (this.isPrivateRelativePath(normalized)) {
      throw new Error('Private storage files require an authorized retrieval path');
    }
    return `/api/storage/${normalized}`;
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
      try { return this.safeRelativePath(pathWithoutQuery.slice('/api/storage/'.length)).normalized; } catch { return null; }
    }

    const uploadsIndex = pathWithoutQuery.indexOf('/uploads/');
    if (uploadsIndex >= 0) {
      try { return this.safeRelativePath(pathWithoutQuery.slice(uploadsIndex + 1)).normalized; } catch { return null; }
    }

    if (pathWithoutQuery.startsWith('uploads/')) {
      try { return this.safeRelativePath(pathWithoutQuery).normalized; } catch { return null; }
    }

    return null;
  }

  static async getFilePath(relativePath: string): Promise<string> {
    const { fullPath } = this.safeRelativePath(relativePath);
    
    // Check if file exists
    const exists = await this.fileExists(relativePath);
    if (!exists) {
      throw new Error('File not found');
    }
    
    return fullPath;
  }

  static isPrivateRelativePath(relativePath: string): boolean {
    try {
      const { normalized } = this.safeRelativePath(relativePath);
      return /^uploads\/\d+\/restaurant-deposit-proofs\//.test(normalized);
    } catch {
      return false;
    }
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
