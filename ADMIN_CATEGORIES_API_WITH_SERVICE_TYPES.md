## Admin Categories API with Service Type Support

### Base URL
`http://localhost:3001/api/admin`

### Authentication
All endpoints require:
- User to be authenticated
- User must have OWNER or ADMIN role for the company

### Endpoints

#### 1. Get Categories
```http
GET /categories?company_id={id}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Haircuts",
      "slug": "haircuts",
      "description": "Hair cutting services",
      "position": 0,
      "is_active": true,
      "global_service_type_id": 1,
      "global_service_type": {
        "id": 1,
        "key": "HAIRCUT",
        "name": "Corte de cabello"
      },
      "_count": {
        "services": 5
      }
    }
  ]
}
```

#### 2. Create Category
```http
POST /categories
```

**Body:**
```json
{
  "company_id": 1,
  "name": "Massage Services",
  "description": "Relaxing massage services",
  "global_service_type_id": 2,
  "position": 1
}
```

**Response:** 201 Created
```json
{
  "success": true,
  "data": {
    "id": 2,
    "name": "Massage Services",
    "slug": "massage-services",
    "description": "Relaxing massage services",
    "position": 1,
    "is_active": true,
    "global_service_type_id": 2,
    "global_service_type": {
      "id": 2,
      "key": "MASSAGE",
      "name": "Masaje"
    }
  }
}
```

#### 3. Update Category
```http
PUT /categories/:id
```

**Body:**
```json
{
  "name": "Updated Category Name",
  "description": "Updated description",
  "global_service_type_id": 3,
  "position": 2,
  "is_active": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Updated Category Name",
    "slug": "updated-category-name",
    "description": "Updated description",
    "position": 2,
    "is_active": true,
    "global_service_type_id": 3,
    "global_service_type": {
      "id": 3,
      "key": "SPA",
      "name": "Spa Services"
    }
  }
}
```

#### 4. Get Global Service Types (for dropdown)
```http
GET /global-service-types
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "key": "HAIRCUT",
      "name": "Corte de cabello",
      "description": "Servicios de corte de cabello"
    },
    {
      "id": 2,
      "key": "MASSAGE",
      "name": "Masaje",
      "description": "Servicios de masaje"
    }
  ]
}
```

### Features:
- Auto-generates slug from name if not provided
- Validates global_service_type_id exists if provided
- Includes global_service_type relation in responses
- Supports filtering categories by company_id query parameter
