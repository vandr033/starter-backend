# Image Serving API

## Serve Company Image

### Endpoint
```
GET /api/uploads/company/:company_id/:type/:filename
```

### Parameters
- **company_id** (number): The ID of the company
- **type** (string): The type of image
  - `'logo'`
  - `'hero'`
  - `'about'`
  - `'staff'`
  - `'gallery'`
- **filename** (string): The name of the file

### Examples
```
GET /api/uploads/company/123/logo/logo.jpg
GET /api/uploads/company/123/staff/45.jpg
GET /api/uploads/company/123/hero/home.webp
GET /api/uploads/company/123/about/image1.png
```

### Response
Returns the image file with appropriate content-type headers.

### Headers
- **Content-Type**: Determined by file extension (image/jpeg, image/png, etc.)
- **Cache-Control**: `public, max-age=86400` (1 day)
- **ETag**: Unique identifier for cache validation

### Error Responses

#### 400 Bad Request
```json
{
  "error": "Invalid company ID"
}
```

```json
{
  "error": "Invalid type"
}
```

```json
{
  "error": "Invalid filename"
}
```

#### 403 Forbidden
```json
{
  "error": "Access denied"
}
```

#### 404 Not Found
```json
{
  "error": "Company not found"
}
```

```json
{
  "error": "File not found"
}
```

#### 429 Too Many Requests
```json
{
  "error": "Too many requests, please try again later"
}
```

## Security Features

1. **Company Validation**: Only serves images from existing companies
2. **Type Validation**: Only allows known image types
3. **Filename Sanitization**: Prevents directory traversal attacks
4. **Path Validation**: Ensures requested files are within storage directory
5. **Rate Limiting**: 100 requests per minute per IP address

## File Storage Structure

```
/storage/uploads/
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

## Usage Examples

### HTML
```html
<img src="/api/uploads/company/123/logo/logo.jpg" alt="Company Logo" />
```

### CSS
```css
.hero-image {
  background-image: url('/api/uploads/company/123/hero/home.webp');
}
```

### JavaScript
```javascript
const imageUrl = '/api/uploads/company/123/staff/45.jpg';
const img = document.createElement('img');
img.src = imageUrl;
document.body.appendChild(img);
```

## Caching

The endpoint implements caching with:
- **Cache-Control**: Public cache for 1 day
- **ETag**: Unique identifier for cache validation
- **304 Not Modified**: Returns empty response if client has cached version

## Supported File Types

- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)
- SVG (.svg)

## Notes

- Images are served directly from the filesystem
- No authentication required (public access to company images)
- Rate limiting prevents abuse
- All paths are validated to prevent security issues
