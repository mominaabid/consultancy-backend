// src/services/fileUpload.service.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.join(__dirname, '../../uploads/documents');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const uploadFile = async (file, studentId, docType) => {
  try {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);
    const ext = path.extname(file.originalname);
    const filename = `${studentId}_${docType}_${timestamp}_${randomStr}${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    
    // Save file
    fs.writeFileSync(filepath, file.buffer);
    
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const fileUrl = `${baseUrl}/uploads/documents/${filename}`;
    
    return {
      fileUrl,
      fileKey: filename,
      fileSize: file.size,
      fileMime: file.mimetype,
      originalName: file.originalname,
      filePath: filepath,
    };
  } catch (error) {
    console.error('File upload error:', error);
    throw new Error('Failed to upload file');
  }
};

export const deleteFile = async (fileKey) => {
  try {
    const filepath = path.join(UPLOAD_DIR, fileKey);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  } catch (error) {
    console.error('File deletion error:', error);
  }
};