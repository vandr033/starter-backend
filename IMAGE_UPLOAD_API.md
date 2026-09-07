# Image Upload API

## Upload Image

### Endpoint
```
POST /api/admin/uploads/image
```

### Authentication
- User must be authenticated
- User must have OWNER or ADMIN role for the company

### Request (multipart/form-data)
- **file**: File (the image) - Required
- **company_id**: number - Required
- **type**: string - Required
  - `'logo'`
  - `'hero_home'`
  - `'hero_about'`
  - `'about_1'`
  - `'about_2'`
  - `'about_3'`
  - `'staff'`
- **entity_id**: number - Required only if type='staff' (this is the staff_id)

### File Requirements
- **Size**: Maximum 5MB
- **Types**: image/jpeg, image/png, image/webp, image/gif

### Response
```json
{
  "code": 200,
  "error": false,
  "message": "Image uploaded successfully",
  "data": {
    "url": "/api/storage/uploads/1/logo/logo.jpg",
    "type": "logo"
  }
}
```

## Delete Image

### Endpoint
```
DELETE /api/admin/uploads/image
```

### Authentication
- User must be authenticated
- User must have OWNER or ADMIN role for the company

### Request Body (JSON)
```json
{
  "company_id": 1,
  "type": "logo",
  "entity_id": 123
}
```

**Parameters:**
- **company_id** (number): The ID of the company - Required
- **type** (string): The type of image to delete - Required
  - `'logo'`
  - `'hero_home'`
  - `'hero_about'`
  - `'about_1'`
  - `'about_2'`
  - `'about_3'`
  - `'staff'`
- **entity_id** (number): Required only if type='staff' (the staff_id)

### Response
```json
{
  "code": 200,
  "error": false,
  "message": "Image deleted successfully"
}
```

### Response when no image exists
```json
{
  "code": 200,
  "error": false,
  "message": "No image to delete"
}
```

### Error Responses
```json
{
  "code": 400,
  "error": true,
  "message": "Company ID is required"
}
```

```json
{
  "code": 400,
  "error": true,
  "message": "Invalid delete type"
}
```

```json
{
  "code": 400,
  "error": true,
  "message": "Entity ID is required for staff deletions"
}
```

```json
{
  "code": 404,
  "error": true,
  "message": "Company not found"
}
```

```json
{
  "code": 404,
  "error": true,
  "message": "Staff profile not found"
}
```

## Storage Locations

Based on the upload type, files are stored in:

| Type | Directory | Filename | Database Field |
|------|-----------|----------|----------------|
| logo | /storage/uploads/{company_id}/logo/ | logo.{ext} | company.logo_url |
| hero_home | /storage/uploads/{company_id}/hero/ | home.{ext} | company.home_hero_image_url |
| hero_about | /storage/uploads/{company_id}/hero/ | about.{ext} | company.about_hero_image_url |
| about_1 | /storage/uploads/{company_id}/about/ | image1.{ext} | company.about_image_1_url |
| about_2 | /storage/uploads/{company_id}/about/ | image2.{ext} | company.about_image_2_url |
| about_3 | /storage/uploads/{company_id}/about/ | image3.{ext} | company.about_image_3_url |
| staff | /storage/uploads/{company_id}/staff/ | {staff_id}.{ext} | staff_profile.image_url |

### Phase 1 validation and company QR

`company_qr` is also a supported authenticated OWNER/ADMIN upload type and is
stored in the company's QR directory. All admin image uploads use the shared
content validator: the declared MIME type, safe filename extension, and file
signature must agree. JPEG, PNG, WebP, and GIF files are limited to 5 MB.

Public payment-proof uploads do not use this admin endpoint. They use the
scoped upload-intent flow documented in `QR_UPLOAD_API.md` and never accept a
caller-selected tenant identifier.

## Example Usage

### Upload Example
```bash
curl -X POST http://localhost:3001/api/admin/uploads/image \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/image.jpg" \
  -F "company_id=1" \
  -F "type=logo"
```

### Delete Example
```bash
curl -X DELETE http://localhost:3001/api/admin/uploads/image \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": 1,
    "type": "logo"
  }'
```

### JavaScript Example
```javascript
// Upload
const formData = new FormData();
formData.append('file', imageFile);
formData.append('company_id', '1');
formData.append('type', 'logo');

const uploadResponse = await fetch('/api/admin/uploads/image', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
  body: formData,
});

// Delete
const deleteResponse = await fetch('/api/admin/uploads/image', {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    company_id: 1,
    type: 'logo'
  }),
});

const result = await deleteResponse.json();
console.log(result.message); // "Image deleted successfully"
```

## Notes

- Existing files are automatically replaced when uploading a new image
- The URL returned can be used directly in the frontend to display the image
- Images are served through the storage endpoint with appropriate cache headers
- All files are stored locally on the server filesystem
