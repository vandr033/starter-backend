import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { env } from '../config/env';

export const serveFile = async (req: Request, res: Response) => {
  try {
    const { filePath } = req.params;
    
    // Handle string array type from Express
    const pathStr = Array.isArray(filePath) ? filePath[0] : filePath;
    
    // Security: sanitize file path to prevent directory traversal
    const sanitizedPath = pathStr.replace(/\.\./g, '').replace(/\/+/g, '/');
    const fullPath = path.join(env.storagePath, sanitizedPath);
    
    // Debug logs
    console.log('Storage path:', env.storagePath);
    console.log('Requested path:', pathStr);
    console.log('Full path:', fullPath);
    
    // Ensure the path is within the storage directory
    const resolvedPath = path.resolve(fullPath);
    const resolvedStoragePath = path.resolve(env.storagePath);
    console.log('Resolved path:', resolvedPath);
    console.log('Resolved storage path:', resolvedStoragePath);
    console.log('Starts with storage path:', resolvedPath.startsWith(resolvedStoragePath));
    
    if (!resolvedPath.startsWith(resolvedStoragePath)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get file extension to determine content type
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = getContentType(ext);
    
    // Set cache headers (1 day)
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      'ETag': `"${Date.now()}"`,
    });
    
    // Send file
    res.sendFile(resolvedPath);
  } catch (error) {
    console.error('Error serving file:', error);
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
