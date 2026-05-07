// // src/services/fileUpload.service.js
// import fs from 'fs';
// import path from 'path';
// import { fileURLToPath } from 'url';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Create separate directories for different upload types
// const DOCUMENTS_DIR = path.join(__dirname, '../../uploads/documents');
// const PAYMENTS_DIR = path.join(__dirname, '../../uploads/payments');

// // Ensure directories exist
// if (!fs.existsSync(DOCUMENTS_DIR)) {
//   fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
// }
// if (!fs.existsSync(PAYMENTS_DIR)) {
//   fs.mkdirSync(PAYMENTS_DIR, { recursive: true });
// }

// // Upload document (existing function)
// export const uploadFile = async (file, studentId, docType) => {
//   try {
//     const timestamp = Date.now();
//     const randomStr = Math.random().toString(36).substring(7);
//     const ext = path.extname(file.originalname);
//     const filename = `${studentId}_${docType}_${timestamp}_${randomStr}${ext}`;
//     const filepath = path.join(DOCUMENTS_DIR, filename);
    
//     // Save file
//     fs.writeFileSync(filepath, file.buffer);
    
//     const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
//     const fileUrl = `${baseUrl}/uploads/documents/${filename}`;
    
//     return {
//       fileUrl,
//       fileKey: filename,
//       fileSize: file.size,
//       fileMime: file.mimetype,
//       originalName: file.originalname,
//       filePath: filepath,
//     };
//   } catch (error) {
//     console.error('File upload error:', error);
//     throw new Error('Failed to upload file');
//   }
// };

// // Upload payment proof (new function)
// export const uploadPaymentProof = async (file, userId, paymentId) => {
//   try {
//     const timestamp = Date.now();
//     const randomStr = Math.random().toString(36).substring(7);
//     const ext = path.extname(file.originalname);
//     const filename = `payment_${userId}_${paymentId}_${timestamp}_${randomStr}${ext}`;
//     const filepath = path.join(PAYMENTS_DIR, filename);
    
//     // Save file
//     fs.writeFileSync(filepath, file.buffer);
    
//     const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
//     const fileUrl = `${baseUrl}/uploads/payments/${filename}`;
    
//     return {
//       fileUrl,
//       fileKey: filename,
//       fileSize: file.size,
//       fileMime: file.mimetype,
//       originalName: file.originalname,
//       filePath: filepath,
//     };
//   } catch (error) {
//     console.error('Payment proof upload error:', error);
//     throw new Error('Failed to upload payment proof');
//   }
// };

// // Delete file (updated to work with both directories)
// export const deleteFile = async (fileKey, type = 'document') => {
//   try {
//     const directory = type === 'payment' ? PAYMENTS_DIR : DOCUMENTS_DIR;
//     const filepath = path.join(directory, fileKey);
//     if (fs.existsSync(filepath)) {
//       fs.unlinkSync(filepath);
//     }
//   } catch (error) {
//     console.error('File deletion error:', error);
//   }
// };
// src/services/fileUpload.service.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Smart directory selection for Vercel + Local
const getUploadsDir = () => {
  if (process.env.NODE_ENV === 'production') {
    return '/tmp/uploads';           // Vercel writable directory
  }
  return path.join(__dirname, '../../uploads'); // Local
};

const UPLOADS_DIR = getUploadsDir();
const DOCUMENTS_DIR = path.join(UPLOADS_DIR, 'documents');
const PAYMENTS_DIR = path.join(UPLOADS_DIR, 'payments');

// Ensure directories exist
const ensureDirectories = () => {
  [DOCUMENTS_DIR, PAYMENTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

ensureDirectories();

// Upload document
export const uploadFile = async (file, studentId, docType) => {
  try {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);
    const ext = path.extname(file.originalname);
    const filename = `${studentId}_${docType}_${timestamp}_${randomStr}${ext}`;
    
    const filepath = path.join(DOCUMENTS_DIR, filename);
    
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

// Upload payment proof
export const uploadPaymentProof = async (file, userId, paymentId) => {
  try {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);
    const ext = path.extname(file.originalname);
    const filename = `payment_${userId}_${paymentId}_${timestamp}_${randomStr}${ext}`;
    
    const filepath = path.join(PAYMENTS_DIR, filename);
    
    fs.writeFileSync(filepath, file.buffer);
    
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const fileUrl = `${baseUrl}/uploads/payments/${filename}`;

    return {
      fileUrl,
      fileKey: filename,
      fileSize: file.size,
      fileMime: file.mimetype,
      originalName: file.originalname,
      filePath: filepath,
    };
  } catch (error) {
    console.error('Payment proof upload error:', error);
    throw new Error('Failed to upload payment proof');
  }
};

// Delete file
export const deleteFile = async (fileKey, type = 'document') => {
  try {
    const directory = type === 'payment' ? PAYMENTS_DIR : DOCUMENTS_DIR;
    const filepath = path.join(directory, fileKey);
    
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  } catch (error) {
    console.error('File deletion error:', error);
  }
};