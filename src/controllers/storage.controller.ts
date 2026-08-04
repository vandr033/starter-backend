import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { StorageService } from '../services/storage.service';

export const serveFile = async (req: Request, res: Response) => {
  try {
    const { filePath } = req.params;

    // Handle string array type from Express
    const pathStr = Array.isArray(filePath) ? filePath[0] : filePath;

    const relativePath = StorageService.toRelativeStoragePath(pathStr);
    if (!relativePath || StorageService.isPrivateRelativePath(relativePath)) return res.status(404).json({ error: 'File not found' });

    // Check if file exists and get stats for ETag
    let stats;
    let resolvedPath: string;
    try {
      resolvedPath = await StorageService.getFilePath(relativePath);
      stats = await fs.stat(resolvedPath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    // Get file extension to determine content type
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = getContentType(ext);

    // ETag based on file modification time and size
    const etag = `"${stats.mtimeMs.toString(36)}-${stats.size.toString(36)}"`;

    // Check if client has cached version
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch === etag) {
      return res.status(304).send();
    }

    // Revalidate on every request so replaced images with the same URL are shown immediately.
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'ETag': etag,
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
    '.pdf': 'application/pdf',
  };
  
  return contentTypes[ext] || 'application/octet-stream';
}
