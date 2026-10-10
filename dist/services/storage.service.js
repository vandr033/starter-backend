"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
const demo_session_service_1 = require("./demo-session.service");
const demo_request_context_1 = require("./demo-request-context");
class StorageService {
    static safeCompanyId(companyId) {
        if (!Number.isInteger(companyId) || companyId <= 0)
            throw new Error('Invalid company id');
        return String(companyId);
    }
    static safeFilename(filename) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,190}$/.test(filename) || filename === '.' || filename === '..')
            throw new Error('Invalid filename');
        return filename;
    }
    static safeFilenamePath(filename) {
        const normalized = filename.trim().replace(/\\/g, '/').replace(/^\/+/, '');
        const segments = normalized.split('/');
        if (!normalized || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
            throw new Error('Invalid filename');
        }
        return segments.map((segment) => this.safeFilename(segment)).join('/');
    }
    static safeRelativePath(relativePath) {
        const normalized = relativePath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
        if (!normalized || !normalized.startsWith('uploads/') || normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..'))
            throw new Error('Invalid storage path');
        const storageRoot = path_1.default.resolve(env_1.env.storagePath);
        const fullPath = path_1.default.resolve(storageRoot, normalized);
        if (fullPath !== storageRoot && !fullPath.startsWith(`${storageRoot}${path_1.default.sep}`))
            throw new Error('Invalid storage path');
        return { normalized, fullPath };
    }
    static getUploadsPath() {
        return path_1.default.join(env_1.env.storagePath, 'uploads');
    }
    static getCompanyPath(companyId) {
        return path_1.default.join(this.getUploadsPath(), this.safeCompanyId(companyId));
    }
    static getCompanyLogoPath(companyId) {
        return path_1.default.join(this.getCompanyPath(companyId), 'logo');
    }
    static getCompanyHeroPath(companyId) {
        return path_1.default.join(this.getCompanyPath(companyId), 'hero');
    }
    static getCompanyAboutPath(companyId) {
        return path_1.default.join(this.getCompanyPath(companyId), 'about');
    }
    static getCompanyStaffPath(companyId) {
        return path_1.default.join(this.getCompanyPath(companyId), 'staff');
    }
    static getCompanyGalleryPath(companyId) {
        return path_1.default.join(this.getCompanyPath(companyId), 'gallery');
    }
    static getCompanyQRPath(companyId) {
        return path_1.default.join(this.getCompanyPath(companyId), 'qr');
    }
    static getCompanyCommerceStorePath(companyId) {
        return path_1.default.join(this.getCompanyPath(companyId), 'commerce-store');
    }
    static getCompanyCommerceCategoriesPath(companyId) {
        return path_1.default.join(this.getCompanyPath(companyId), 'commerce-categories');
    }
    static getCompanyCommerceProductsPath(companyId) {
        return path_1.default.join(this.getCompanyPath(companyId), 'commerce-products');
    }
    static getCompanyCommercePaymentProofsPath(companyId) {
        return path_1.default.join(this.getCompanyPath(companyId), 'commerce-payment-proofs');
    }
    static getCompanyGroupEventsPath(companyId) {
        return path_1.default.join(this.getCompanyPath(companyId), 'group-events');
    }
    static getCompanyGroupClassesPath(companyId) {
        return path_1.default.join(this.getCompanyPath(companyId), 'group-classes');
    }
    static getCompanyRestaurantMenuPath(companyId, kind) {
        return path_1.default.join(this.getCompanyPath(companyId), 'restaurant-menu', kind);
    }
    static getCompanyRestaurantDepositProofsPath(companyId) {
        return path_1.default.join(this.getCompanyPath(companyId), 'restaurant-deposit-proofs');
    }
    static async ensureCompanyDirectories(companyId) {
        if ((0, demo_request_context_1.isDemoRequest)() || await (0, demo_session_service_1.isDemoCompanyId)(companyId))
            throw new Error('DEMO_READ_ONLY');
        const companyPath = this.getCompanyPath(companyId);
        await fs_1.promises.mkdir(companyPath, { recursive: true });
        await fs_1.promises.mkdir(this.getCompanyLogoPath(companyId), { recursive: true });
        await fs_1.promises.mkdir(this.getCompanyHeroPath(companyId), { recursive: true });
        await fs_1.promises.mkdir(this.getCompanyAboutPath(companyId), { recursive: true });
        await fs_1.promises.mkdir(this.getCompanyStaffPath(companyId), { recursive: true });
        await fs_1.promises.mkdir(this.getCompanyGalleryPath(companyId), { recursive: true });
        await fs_1.promises.mkdir(this.getCompanyQRPath(companyId), { recursive: true });
        await fs_1.promises.mkdir(this.getCompanyCommerceStorePath(companyId), { recursive: true });
        await fs_1.promises.mkdir(this.getCompanyCommerceCategoriesPath(companyId), { recursive: true });
        await fs_1.promises.mkdir(this.getCompanyCommerceProductsPath(companyId), { recursive: true });
        await fs_1.promises.mkdir(this.getCompanyCommercePaymentProofsPath(companyId), { recursive: true });
        await fs_1.promises.mkdir(this.getCompanyGroupEventsPath(companyId), { recursive: true });
        await fs_1.promises.mkdir(this.getCompanyGroupClassesPath(companyId), { recursive: true });
        await fs_1.promises.mkdir(this.getCompanyRestaurantMenuPath(companyId, 'items'), { recursive: true });
        await fs_1.promises.mkdir(this.getCompanyRestaurantMenuPath(companyId, 'categories'), { recursive: true });
        await fs_1.promises.mkdir(this.getCompanyRestaurantDepositProofsPath(companyId), { recursive: true });
    }
    static async saveFile(companyId, type, filename, buffer) {
        await this.ensureCompanyDirectories(companyId);
        let directory;
        switch (type) {
            case 'logo':
                directory = this.getCompanyLogoPath(companyId);
                // Remove existing logo files
                try {
                    const files = await fs_1.promises.readdir(directory);
                    for (const file of files) {
                        if (file !== filename) {
                            await fs_1.promises.unlink(path_1.default.join(directory, file));
                        }
                    }
                }
                catch (error) {
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
        const filePath = path_1.default.join(directory, safeFilename);
        const resolvedDirectory = path_1.default.resolve(directory);
        const resolvedFilePath = path_1.default.resolve(filePath);
        if (!resolvedFilePath.startsWith(`${resolvedDirectory}${path_1.default.sep}`))
            throw new Error('Invalid storage filename');
        await fs_1.promises.mkdir(path_1.default.dirname(filePath), { recursive: true });
        await fs_1.promises.writeFile(filePath, buffer);
        // Return relative path from storage root
        return path_1.default.relative(env_1.env.storagePath, filePath);
    }
    static async deleteFile(relativePath) {
        const { fullPath, normalized } = this.safeRelativePath(relativePath);
        const companyId = Number(normalized.split('/')[1]);
        if ((0, demo_request_context_1.isDemoRequest)() || (Number.isInteger(companyId) && companyId > 0 && await (0, demo_session_service_1.isDemoCompanyId)(companyId))) {
            throw new Error('DEMO_READ_ONLY');
        }
        try {
            await fs_1.promises.unlink(fullPath);
        }
        catch (error) {
            console.error('Error deleting file:', error);
            throw error;
        }
    }
    static async fileExists(relativePath) {
        let fullPath;
        try {
            fullPath = this.safeRelativePath(relativePath).fullPath;
        }
        catch {
            return false;
        }
        try {
            await fs_1.promises.access(fullPath);
            return true;
        }
        catch {
            return false;
        }
    }
    static getFileUrl(relativePath) {
        const { normalized } = this.safeRelativePath(relativePath);
        if (this.isPrivateRelativePath(normalized)) {
            throw new Error('Private storage files require an authorized retrieval path');
        }
        return `/api/storage/${normalized}`;
    }
    static toRelativeStoragePath(rawPathOrUrl) {
        const normalized = rawPathOrUrl.trim();
        if (!normalized)
            return null;
        if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
            try {
                return this.toRelativeStoragePath(new URL(normalized).pathname);
            }
            catch {
                return null;
            }
        }
        const pathWithoutQuery = normalized.split(/[?#]/, 1)[0];
        if (!pathWithoutQuery)
            return null;
        if (pathWithoutQuery.startsWith('/api/storage/')) {
            try {
                return this.safeRelativePath(pathWithoutQuery.slice('/api/storage/'.length)).normalized;
            }
            catch {
                return null;
            }
        }
        const uploadsIndex = pathWithoutQuery.indexOf('/uploads/');
        if (uploadsIndex >= 0) {
            try {
                return this.safeRelativePath(pathWithoutQuery.slice(uploadsIndex + 1)).normalized;
            }
            catch {
                return null;
            }
        }
        if (pathWithoutQuery.startsWith('uploads/')) {
            try {
                return this.safeRelativePath(pathWithoutQuery).normalized;
            }
            catch {
                return null;
            }
        }
        return null;
    }
    static async getFilePath(relativePath) {
        const { fullPath } = this.safeRelativePath(relativePath);
        // Check if file exists
        const exists = await this.fileExists(relativePath);
        if (!exists) {
            throw new Error('File not found');
        }
        return fullPath;
    }
    static isPrivateRelativePath(relativePath) {
        try {
            const { normalized } = this.safeRelativePath(relativePath);
            return /^uploads\/\d+\/restaurant-deposit-proofs\//.test(normalized);
        }
        catch {
            return false;
        }
    }
    static getLogoFilename(companyId) {
        return `logo.${companyId}`;
    }
    static getHomeHeroFilename(companyId) {
        return `home.${companyId}`;
    }
    static getAboutHeroFilename(companyId) {
        return `about.${companyId}`;
    }
    static getAboutImageFilename(companyId, imageNumber) {
        return `image${imageNumber}.${companyId}`;
    }
    static getStaffFilename(staffId) {
        return `staff.${staffId}`;
    }
}
exports.StorageService = StorageService;
