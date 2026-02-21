# Public Booking API

## Create Public Booking

### Endpoint
```
POST /api/booking/public
```

### Description
Create a new booking as a guest/customer without requiring authentication. This endpoint is designed for public-facing booking forms where customers may not have an account.

### Request Body
```json
{
  "company_id": 1,
  "staff_id": 1,
  "service_ids": [1, 2],
  "start_at": "2024-01-15T10:00:00.000Z",
  "payment_method": "QR",
  "notes": "Optional booking notes",
  "client_name": "John Doe",
  "client_email": "john@example.com",
  "client_phone_prefix": "591",
  "client_phone_number": "71234567",
  "qr_proof_image_url": "/api/storage/uploads/1/qr/payment-proof.jpg"
}
```

### Minimal Request (No Customer Info)
```json
{
  "company_id": 1,
  "staff_id": 1,
  "service_ids": [1],
  "start_at": "2024-01-15T10:00:00.000Z",
  "payment_method": "NONE"
}
```

### Required Fields
- **company_id** (number): ID of the company to book with
- **staff_id** (number): ID of the staff member performing the services
- **service_ids** (array): Array of service IDs to book
- **start_at** (string): ISO datetime string for the booking start time
- **payment_method** (string): Payment method - "NONE", "CASH", or "QR"

### Optional Fields
- **notes** (string): Additional notes for the booking
- **client_name** (string): Customer's full name
- **client_email** (string): Customer's email address
- **client_phone_prefix** (string): Phone country code (default: "591")
- **client_phone_number** (string): Customer's phone number
- **qr_proof_image_url** (string): URL to QR payment proof image (required if payment_method is "QR")

### Validation Rules
- Email must be a valid email format (if provided)
- Phone number must be a valid string (if provided)
- If payment_method is "QR", qr_proof_image_url is required
- All services must belong to the specified company
- Staff must be able to perform the selected services
- Time slot must be available

### Response
```json
{
  "code": 201,
  "error": false,
  "message": "Booking created successfully",
  "data": {
    "booking_id": 123,
    "start_at": "2024-01-15T10:00:00.000Z",
    "end_at": "2024-01-15T11:30:00.000Z",
    "total_price_cents": 15000,
    "status": "CONFIRMED",
    "payment_status": "PENDING"
  }
}
```

### Error Responses

#### 400 Bad Request
```json
{
  "code": 400,
  "error": true,
  "message": "client_email must be a valid email address"
}
```

#### 404 Not Found
```json
{
  "code": 404,
  "error": true,
  "message": "Company not found or inactive"
}
```

#### 409 Conflict
```json
{
  "code": 409,
  "error": true,
  "message": "Time slot is already booked"
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

## Payment Methods

### NONE
- No payment method selected
- Payment status: UNPAID
- Customer will pay at the location

### CASH
- Cash payment
- Payment status: PENDING
- Customer will pay with cash at the location

### QR
- QR code payment
- Payment status: PENDING
- Requires qr_proof_image_url
- Customer has uploaded proof of QR payment

## Customer Handling

The endpoint automatically:
1. Creates a new customer profile if one doesn't exist with the email
2. Links the booking to the customer profile
3. Stores customer contact information with the booking

## Example Usage

### JavaScript Example
```javascript
const createBooking = async (bookingData) => {
  const response = await fetch('/api/booking/public', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      company_id: 1,
      staff_id: 1,
      service_ids: [1, 2],
      start_at: '2024-01-15T10:00:00.000Z',
      payment_method: 'CASH',
      client_name: 'John Doe',
      client_email: 'john@example.com',
      client_phone_number: '71234567',
      notes: 'First time customer',
    }),
  });
  
  const result = await response.json();
  if (!result.error) {
    console.log('Booking created:', result.data);
    // Redirect to confirmation page
    window.location.href = `/booking-confirmation/${result.data.booking_id}`;
  } else {
    console.error('Booking failed:', result.message);
    alert(result.message);
  }
};
```

### React Example
```jsx
import React, { useState } from 'react';

function BookingForm() {
  const [formData, setFormData] = useState({
    client_name: '',
    client_email: '',
    client_phone_number: '',
    notes: '',
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/booking/public', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company_id: 1,
          staff_id: selectedStaff.id,
          service_ids: selectedServices.map(s => s.id),
          start_at: selectedSlot,
          payment_method: selectedPaymentMethod,
          ...formData,
        }),
      });
      
      const result = await response.json();
      
      if (!result.error) {
        // Success
        onBookingSuccess(result.data);
      } else {
        // Error
        setError(result.message);
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
    </form>
  );
}
```

## Security Considerations

1. **Rate Limiting**: Consider implementing rate limiting to prevent abuse
2. **Validation**: All inputs are validated on the server
3. **Time Slot Conflicts**: The system prevents double-booking
4. **Service Validation**: Only services belonging to the company can be booked
5. **Staff Validation**: Staff must be able to perform the selected services

## Differences from Authenticated Booking

| Feature | Authenticated Booking | Public Booking |
|---------|---------------------|----------------|
| Authentication | Required | Not required |
| Customer Profile | Linked to user account | Created/Found by email |
| User ID | Stored with booking | Null |
| Customer Info | From user profile | Provided in request |
| QR Proof | Optional | Required for QR payments |
