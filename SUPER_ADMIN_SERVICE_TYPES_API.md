## Super Admin Service Types API Documentation

### Base URL
`http://localhost:3001/api/super-admin`

### Authentication
All endpoints require:
- User to be authenticated
- User must have `is_super_admin: true`

### Endpoints

#### 1. Get All Service Types
```http
GET /service-types
```

**Response:**
```json
[
  {
    "id": 1,
    "key": "HAIRCUT",
    "name": "Corte de cabello",
    "description": "Servicios de corte de cabello",
    "usageCount": 5
  }
]
```

#### 2. Create Service Type
```http
POST /service-types
```

**Body:**
```json
{
  "key": "MASSAGE",
  "name": "Masaje",
  "description": "Servicios de masaje"
}
```

**Response:** 201 Created
```json
{
  "id": 2,
  "key": "MASSAGE",
  "name": "Masaje",
  "description": "Servicios de masaje"
}
```

#### 3. Update Service Type
```http
PUT /service-types/:id
```

**Body:**
```json
{
  "name": "Masaje relajante",
  "description": "Servicios de masaje relajante"
}
```

**Response:**
```json
{
  "id": 2,
  "key": "MASSAGE",
  "name": "Masaje relajante",
  "description": "Servicios de masaje relajante"
}
```

#### 4. Delete Service Type
```http
DELETE /service-types/:id
```

**Response:** 204 No Content

**Error if in use:** 409 Conflict
```json
{
  "error": "Cannot delete: 3 categories are using this type"
}
```

### Error Responses

- **401 Unauthorized**: User not authenticated
- **403 Forbidden**: User not super admin
- **404 Not Found**: Service type not found
- **409 Conflict**: Key already exists or service type in use
- **500 Internal Server Error**: Server error
