# Company Content API

## Get Company Content

### Endpoint
```
GET /api/admin/company/:id/content
```

### Authentication
- User must be authenticated
- User must have OWNER or ADMIN role for the company

### Parameters
- **id** (number): The ID of the company

### Response
```json
{
  "code": 200,
  "error": false,
  "data": {
    "texts": {
      "about_us_text": "...",
      "our_story_text": "...",
      "about_us_hero_text": "..."
    },
    "images": {
      "logo_url": "/api/uploads/company/123/logo/logo.jpg",
      "home_hero_image_url": "/api/uploads/company/123/hero/home.jpg",
      "about_hero_image_url": "/api/uploads/company/123/hero/about.jpg",
      "about_image_1_url": "/api/uploads/company/123/about/image1.jpg",
      "about_image_2_url": null,
      "about_image_3_url": null
    },
    "staff": [
      {
        "id": 1,
        "display_name": "John",
        "image_url": "/api/uploads/company/123/staff/1.jpg"
      },
      {
        "id": 2,
        "display_name": "Jane",
        "image_url": null
      }
    ]
  }
}
```

### Error Responses

#### 400 Bad Request
```json
{
  "code": 400,
  "error": true,
  "message": "Invalid company ID"
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

#### 404 Not Found
```json
{
  "code": 404,
  "error": true,
  "message": "Company not found"
}
```

## Update Company Content

### Endpoint
```
PUT /api/admin/company/:id/content
```

### Authentication
- User must be authenticated
- User must have OWNER or ADMIN role for the company

### Parameters
- **id** (number): The ID of the company

### Request Body (JSON)
```json
{
  "about_us_text": "<p>About our company...</p>",
  "our_story_text": "<p>Our story...</p>",
  "about_us_hero_text": "<p>Hero text for about page...</p>"
}
```

**Fields:** All fields are optional
- **about_us_text** (string): HTML content for the about us section
- **our_story_text** (string): HTML content for the our story section
- **about_us_hero_text** (string): HTML content for the about page hero section

### HTML Sanitization
The endpoint sanitizes HTML to prevent XSS attacks. Allowed tags:
- Text formatting: `<p>`, `<br>`, `<strong>`, `<em>`, `<u>`
- Headings: `<h1>`, `<h2>`, `<h3>`, `<h4>`, `<h5>`, `<h6>`
- Lists: `<ul>`, `<ol>`, `<li>`

All other tags and attributes will be removed.

### Response
```json
{
  "code": 200,
  "error": false,
  "message": "Content updated successfully",
  "data": {
    "id": 1,
    "name": "Company Name",
    "about_us_text": "<p>About our company...</p>",
    "our_story_text": "<p>Our story...</p>",
    "about_us_hero_text": "<p>Hero text for about page...</p>",
    "...": "other company fields"
  }
}
```

### Error Responses

#### 400 Bad Request
```json
{
  "code": 400,
  "error": true,
  "message": "Invalid company ID"
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

#### 404 Not Found
```json
{
  "code": 404,
  "error": true,
  "message": "Company not found"
}
```

#### 500 Internal Server Error
```json
{
  "code": 500,
  "error": true,
  "message": "Failed to update content"
}
```

## Example Usage

### Get Content Example
```javascript
const getContent = async (companyId) => {
  const response = await fetch(`/api/admin/company/${companyId}/content`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  
  const result = await response.json();
  
  if (result.error) {
    console.error('Error:', result.message);
  } else {
    console.log('Company content:', result.data);
    // Access text content
    console.log(result.data.texts.about_us_text);
    // Access image URLs
    console.log(result.data.images.logo_url);
    // Access staff list
    console.log(result.data.staff);
  }
};
```

### Update Example
```javascript
const updateContent = async (companyId, content) => {
  const response = await fetch(`/api/admin/company/${companyId}/content`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(content),
  });
  
  const result = await response.json();
  
  if (result.error) {
    console.error('Error:', result.message);
  } else {
    console.log('Content updated successfully');
  }
};

// Usage
updateContent(1, {
  about_us_text: '<p>We are a great company!</p>',
  our_story_text: '<p>Founded in 2020, we started with...</p>'
});
```

### cURL Example
```bash
curl -X PUT http://localhost:3001/api/admin/company/1/content \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "about_us_text": "<p>About our company...</p>",
    "our_story_text": "<p>Our story...</p>"
  }'
```

## Notes

- Only provided fields will be updated
- HTML is automatically sanitized for security
- The endpoint validates that the user has admin access to the company
- Content can include basic formatting like bold, italic, lists, and headings
- All HTML attributes are stripped for security
