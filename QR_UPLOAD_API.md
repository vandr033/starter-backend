# QR Code Upload API

## Upload QR Code

### Endpoint
```
POST /api/upload/qr
```

### Description
Upload a QR code payment proof image for bookings. This endpoint is public and does not require authentication.

### Request
- **Method**: POST
- **Content-Type**: multipart/form-data
- **Body**: FormData with:
  - `image` (file): The QR code image file
  - `company_id` (number): The company ID for organizing uploads

### File Requirements
- **Types**: JPEG, JPG, PNG, WebP
- **Maximum Size**: 5MB
- **Naming**: Automatic (format: qr-{timestamp}-{random}.{extension})

### Response
```json
{
  "code": 200,
  "error": false,
  "message": "QR code uploaded successfully",
  "data": {
    "url": "/api/storage/uploads/1/qr/qr-1640995200000-abc123.jpg",
    "filename": "qr-1640995200000-abc123.jpg",
    "size": 245760,
    "mimetype": "image/jpeg"
  }
}
```

### Error Responses

#### 400 Bad Request
```json
{
  "code": 400,
  "error": true,
  "message": "No file uploaded"
}
```

```json
{
  "code": 400,
  "error": true,
  "message": "Invalid file type. Only JPEG, PNG, and WebP images are allowed"
}
```

```json
{
  "code": 400,
  "error": true,
  "message": "File too large. Maximum size is 5MB"
}
```

## Delete QR Code

### Endpoint
```
DELETE /api/upload/qr
```

### Description
Delete a previously uploaded QR code image.

### Request Body
```json
{
  "url": "/api/storage/uploads/1/qr/qr-1640995200000-abc123.jpg"
}
```

### Response
```json
{
  "code": 200,
  "error": false,
  "message": "QR code deleted successfully"
}
```

## Usage in Booking

### Step 1: Upload QR Code
```javascript
const uploadQR = async (file, companyId) => {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('company_id', companyId);

  const response = await fetch('/api/upload/qr', {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();
  if (!result.error) {
    return result.data.url; // Returns the QR image URL
  }
  throw new Error(result.message);
};
```

### Step 2: Create Booking with QR URL
```javascript
const createBooking = async (qrUrl) => {
  const response = await fetch('/api/booking/public', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      company_id: 1,
      staff_id: 1,
      service_ids: [1],
      start_at: '2024-01-15T10:00:00.000Z',
      payment_method: 'QR',
      qr_proof_image_url: qrUrl, // Include the uploaded QR URL
      client_name: 'John Doe',
      client_email: 'john@example.com',
      client_phone_number: '71234567',
    }),
  });

  return await response.json();
};
```

### Complete Example
```javascript
// Handle QR upload and booking
const handleQRBooking = async (file) => {
  try {
    // Step 1: Upload QR code
    const qrUrl = await uploadQR(file, 1);
    
    // Step 2: Create booking with QR URL
    const booking = await createBooking(qrUrl);
    
    console.log('Booking created:', booking);
    
    // If booking fails, you might want to delete the uploaded QR
    if (booking.error) {
      await deleteQR(qrUrl);
    }
  } catch (error) {
    console.error('Booking failed:', error);
  }
};

// Delete QR if needed
const deleteQR = async (url) => {
  await fetch('/api/upload/qr', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });
};
```

## React Component Example

```jsx
import React, { useState } from 'react';

function QRBookingForm() {
  const [qrFile, setQrFile] = useState(null);
  const [qrUrl, setQrUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleQRUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('company_id', '1');

      const response = await fetch('/api/upload/qr', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (!result.error) {
        setQrUrl(result.data.url);
        setQrFile(file);
      } else {
        alert(result.message);
      }
    } catch (error) {
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!qrUrl) {
      alert('Please upload QR code first');
      return;
    }

    // Create booking with QR URL
    const bookingData = {
      company_id: 1,
      staff_id: 1,
      service_ids: [1],
      start_at: '2024-01-15T10:00:00.000Z',
      payment_method: 'QR',
      qr_proof_image_url: qrUrl,
      // ... other fields
    };

    const response = await fetch('/api/booking/public', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bookingData),
    });

    const result = await response.json();
    console.log('Booking result:', result);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Upload QR Payment Proof:</label>
        <input
          type="file"
          accept="image/*"
          onChange={handleQRUpload}
          disabled={uploading}
        />
        {uploading && <p>Uploading...</p>}
        {qrUrl && (
          <div>
            <img src={qrUrl} alt="QR Code" style={{ maxWidth: '200px' }} />
            <p>QR uploaded successfully</p>
          </div>
        )}
      </div>
      
      <button type="submit" disabled={!qrUrl}>
        Create Booking
      </button>
    </form>
  );
}
```

## Security Considerations

1. **File Type Validation**: Only image files are accepted
2. **Size Limits**: Maximum file size of 5MB
3. **Path Validation**: Files are stored in organized directory structure
4. **URL Format**: QR URLs follow a predictable pattern for validation

## File Storage

- QR codes are stored in: `uploads/{company_id}/qr/`
- URLs are served via: `/api/storage/uploads/{company_id}/qr/{filename}`
- Automatic cleanup can be implemented based on booking status

## Booking Details

The QR proof URL is now included in:
- Admin booking list endpoints
- Individual booking details
- Public booking confirmation (if implemented)

This allows staff to view and verify QR payment proofs for bookings.
