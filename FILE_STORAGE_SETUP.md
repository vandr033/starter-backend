# File Storage Setup

## Directory Structure

```
/storage/
└── uploads/
    └── [company_id]/
        ├── logo/
        │   └── logo.[ext]
        ├── hero/
        │   ├── home.[ext]
        │   └── about.[ext]
        ├── about/
        │   ├── image1.[ext]
        │   ├── image2.[ext]
        │   └── image3.[ext]
        ├── staff/
        │   ├── [staff_id].[ext]
        │   └── ...
        └── gallery/
            └── ...
```

## Configuration

Add to your `.env` file:
```env
STORAGE_PATH=./storage
```

## Usage

### Storage Service

The `StorageService` provides methods for managing files:

```typescript
import { StorageService } from '../services/storage.service';

// Ensure company directories exist
await StorageService.ensureCompanyDirectories(companyId);

// Save a file
const relativePath = await StorageService.saveFile(
  companyId,
  'logo', // 'logo' | 'hero' | 'about' | 'staff' | 'gallery'
  filename,
  buffer
);

// Get file URL for frontend
const url = StorageService.getFileUrl(relativePath);
// Returns: /api/storage/uploads/1/logo/logo.1

// Check if file exists
const exists = await StorageService.fileExists(relativePath);

// Delete a file
await StorageService.deleteFile(relativePath);
```

### Helper Methods

```typescript
// Get specific file paths
StorageService.getCompanyLogoPath(companyId);
StorageService.getCompanyHeroPath(companyId);
StorageService.getCompanyAboutPath(companyId);
StorageService.getCompanyStaffPath(companyId);
StorageService.getCompanyGalleryPath(companyId);

// Generate filenames
StorageService.getLogoFilename(companyId); // "logo.1"
StorageService.getHomeHeroFilename(companyId); // "home.1"
StorageService.getAboutHeroFilename(companyId); // "about.1"
StorageService.getAboutImageFilename(companyId, 1); // "image1.1"
StorageService.getStaffFilename(staffId); // "staff.123"
```

## API Endpoints

### Serve Files

```
GET /api/storage/{filePath}
```

Example:
```
GET /api/storage/uploads/1/logo/logo.1
```

Returns the file with appropriate content-type and cache headers.

## Security

- Path sanitization prevents directory traversal attacks
- Only files within the storage directory can be accessed
- Content-Type is determined by file extension
- Cache headers set for 1 day

## File Upload Example

```typescript
import multer from 'multer';
import { StorageService } from '../services/storage.service';

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Upload endpoint
router.post('/upload/logo', upload.single('image'), async (req, res) => {
  try {
    const { companyId } = req.body;
    const filename = StorageService.getLogoFilename(companyId);
    
    const relativePath = await StorageService.saveFile(
      companyId,
      'logo',
      filename,
      req.file.buffer
    );
    
    const url = StorageService.getFileUrl(relativePath);
    
    res.json({ success: true, url });
  } catch (error) {
    res.status(500).json({ error: 'Upload failed' });
  }
});
```

## Important Notes

- All images are served through the backend API, NOT a CDN
- The frontend requests images via API endpoints that read from the filesystem
- Directory structure is automatically created when needed
- Old logo files are automatically replaced when uploading a new one
- The `/storage` directory is added to `.gitignore` to avoid committing uploaded files
