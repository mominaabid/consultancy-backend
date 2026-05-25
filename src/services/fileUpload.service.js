import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getUploadsDir = () => {
  if (process.env.NODE_ENV === "production") {
    return "/tmp/uploads";
  }
  return path.join(__dirname, "../../uploads");
};

const UPLOADS_DIR = getUploadsDir();
const DOCUMENTS_DIR = path.join(UPLOADS_DIR, "documents");
const PAYMENTS_DIR = path.join(UPLOADS_DIR, "payments");

const ensureDirectories = () => {
  [DOCUMENTS_DIR, PAYMENTS_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

ensureDirectories();

export const uploadFile = async (file, studentId, docType) => {
  try {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);
    const ext = path.extname(file.originalname);
    const filename = `${studentId}_${docType}_${timestamp}_${randomStr}${ext}`;

    const filepath = path.join(DOCUMENTS_DIR, filename);

    fs.writeFileSync(filepath, file.buffer);

    const baseUrl =
      process.env.BASE_URL ||
      `${
        process.env.NODE_ENV === "production"
          ? "https://consultancy-backend-av89.vercel.app"
          : "http://localhost:3001"
      }`;

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
    console.error("File upload error:", error);
    throw new Error("Failed to upload file");
  }
};

export const uploadPaymentProof = async (file, userId, paymentId) => {
  try {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);
    const ext = path.extname(file.originalname);
    const filename = `payment_${userId}_${paymentId}_${timestamp}_${randomStr}${ext}`;

    const filepath = path.join(PAYMENTS_DIR, filename);

    fs.writeFileSync(filepath, file.buffer);

    const baseUrl =
      process.env.BASE_URL ||
      `${
        process.env.NODE_ENV === "production"
          ? "https://consultancy-backend-av89.vercel.app"
          : "http://localhost:3001"
      }`;

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
    console.error("Payment proof upload error:", error);
    throw new Error("Failed to upload payment proof");
  }
};

export const deleteFile = async (fileKey, type = "document") => {
  try {
    const directory = type === "payment" ? PAYMENTS_DIR : DOCUMENTS_DIR;
    const filepath = path.join(directory, fileKey);

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  } catch (error) {
    console.error("File deletion error:", error);
  }
};
