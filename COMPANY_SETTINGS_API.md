# Company Settings API

## Get Company Settings

### Endpoint
```
GET /api/admin/settings
```

### Authentication
- User must be authenticated
- User must have OWNER or ADMIN role for the company

### Response
```json
{
  "code": 200,
  "error": false,
  "message": "Settings retrieved successfully",
  "data": {
    "id": 1,
    "company_id": 1,
    "booking_buffer_minutes": 10,
    "booking_time_granularity_minutes": 5,
    "cancel_limit_minutes": 120,
    "reschedule_limit_minutes": 120,
    "allow_qr_payment": true,
    "qr_image_url": null,
    "allow_cash_payment": true,
    "send_email_notifications": true,
    "send_whatsapp_notifications": false,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

## Update Company Settings

### Endpoint
```
PUT /api/admin/settings
```

### Authentication
- User must be authenticated
- User must have OWNER or ADMIN role for the company

### Request Body
```json
{
  "booking_buffer_minutes": 15,
  "booking_time_granularity_minutes": 10,
  "cancel_limit_minutes": 60,
  "reschedule_limit_minutes": 60,
  "allow_qr_payment": true,
  "qr_image_url": "/api/storage/uploads/1/qr/qr-code.png",
  "allow_cash_payment": true,
  "send_email_notifications": true,
  "send_whatsapp_notifications": true
}
```

### Field Descriptions
- **booking_buffer_minutes** (number, min: 0): Buffer time between bookings
- **booking_time_granularity_minutes** (number, min: 5): Time slot granularity
- **cancel_limit_minutes** (number, min: 0): Minutes before booking when cancellation is not allowed
- **reschedule_limit_minutes** (number, min: 0): Minutes before booking when rescheduling is not allowed
- **allow_qr_payment** (boolean): Enable QR code payments
- **qr_image_url** (string|null): URL to QR payment image
- **allow_cash_payment** (boolean): Enable cash payments
- **send_email_notifications** (boolean): Send email notifications
- **send_whatsapp_notifications** (boolean): Send WhatsApp notifications

### Response
```json
{
  "code": 200,
  "error": false,
  "message": "Settings updated successfully",
  "data": {
    "id": 1,
    "company_id": 1,
    "booking_buffer_minutes": 15,
    "booking_time_granularity_minutes": 10,
    "cancel_limit_minutes": 60,
    "reschedule_limit_minutes": 60,
    "allow_qr_payment": true,
    "qr_image_url": "/api/storage/uploads/1/qr/qr-code.png",
    "allow_cash_payment": true,
    "send_email_notifications": true,
    "send_whatsapp_notifications": true,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T12:00:00.000Z"
  }
}
```

## Reset Company Settings

### Endpoint
```
DELETE /api/admin/settings
```

### Authentication
- User must be authenticated
- User must have OWNER or ADMIN role for the company

### Response
```json
{
  "code": 200,
  "error": false,
  "message": "Settings reset to defaults successfully",
  "data": {
    "id": 2,
    "company_id": 1,
    "booking_buffer_minutes": 10,
    "booking_time_granularity_minutes": 5,
    "cancel_limit_minutes": 120,
    "reschedule_limit_minutes": 120,
    "allow_qr_payment": true,
    "qr_image_url": null,
    "allow_cash_payment": true,
    "send_email_notifications": true,
    "send_whatsapp_notifications": false,
    "created_at": "2024-01-01T12:00:00.000Z",
    "updated_at": "2024-01-01T12:00:00.000Z"
  }
}
```

## Default Settings

When settings are not configured, the following defaults are applied:
- booking_buffer_minutes: 10
- booking_time_granularity_minutes: 5
- cancel_limit_minutes: 120
- reschedule_limit_minutes: 120
- allow_qr_payment: true
- qr_image_url: null
- allow_cash_payment: true
- send_email_notifications: true
- send_whatsapp_notifications: false

## Error Responses

#### 400 Bad Request
```json
{
  "code": 400,
  "error": true,
  "message": "booking_time_granularity_minutes must be at least 5"
}
```

#### 403 Forbidden
```json
{
  "code": 403,
  "error": true,
  "message": "Access denied"
}
```

#### 500 Internal Server Error
```json
{
  "code": 500,
  "error": true,
  "message": "Internal server error"
}
```

## Example Usage

### JavaScript Example
```javascript
// Get settings
const getSettings = async () => {
  const response = await fetch('/api/admin/settings', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  
  const result = await response.json();
  if (!result.error) {
    console.log('Settings:', result.data);
  }
};

// Update settings
const updateSettings = async (settings) => {
  const response = await fetch('/api/admin/settings', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  });
  
  const result = await response.json();
  if (!result.error) {
    console.log('Settings updated successfully');
  }
};

// Reset settings
const resetSettings = async () => {
  const response = await fetch('/api/admin/settings', {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  
  const result = await response.json();
  if (!result.error) {
    console.log('Settings reset to defaults');
  }
};
```
