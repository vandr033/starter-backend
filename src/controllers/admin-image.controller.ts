import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '../prisma/client';
import { env } from '../config/env';

export const serveCompanyImage = async (req: Request, res: Response) => {
  try {
    const { company_id, type, filename } = req.params;
    
    // Handle string array types from Express
    const companyIdStr = Array.isArray(company_id) ? company_id[0] : company_id;
    const typeStr = Array.isArray(type) ? type[0] : type;
    const filenameStr = Array.isArray(filename) ? filename[0] : filename;
    
    // Validate company_id
    const companyId = parseInt(companyIdStr);
    if (isNaN(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }
    
    // Check if company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    // Validate type
    const allowedTypes = ['logo', 'hero', 'about', 'staff', 'gallery'];
    if (!allowedTypes.includes(typeStr)) {
      return res.status(400).json({ error: 'Invalid type' });
    }
    
    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = filenameStr.replace(/[^a-zA-Z0-9.-]/g, '');
    if (!sanitizedFilename || sanitizedFilename !== filenameStr) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    // Construct file path
    const filePath = path.join(
      env.storagePath,
      'uploads',
      companyIdStr,
      typeStr,
      filenameStr
    );
    
    // Ensure the path is within the storage directory
    const resolvedPath = path.resolve(filePath);
    const storageDir = path.resolve(env.storagePath);
    if (!resolvedPath.startsWith(storageDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get file extension to determine content type
    const ext = path.extname(filename as string).toLowerCase();
    const contentType = getContentType(ext);
    
    // Set cache headers (1 day)
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      'ETag': `"${companyId}-${typeStr}-${filenameStr}"`,
    });
    
    // Check if client has cached version
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch === `"${companyId}-${typeStr}-${filenameStr}"`) {
      return res.status(304).send();
    }
    
    // Send file
    res.sendFile(resolvedPath);
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

function getContentType(ext: string): string {
  const contentTypes: { [key: string]: string } = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };
  
  return contentTypes[ext] || 'application/octet-stream';
}
