import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCOPES = ["https://www.googleapis.com/auth/drive"];
const PARENT_FOLDER_ID = process.env.DRIVE_PARENT_FOLDER_ID;

function getAuth() {
  return new google.auth.GoogleAuth({
   keyFile: path.resolve("google-service-account.json"),
    scopes: SCOPES,
  });
}

export async function getOrCreateStudentFolder(studentName, leadId) {
  const auth = await getAuth();
  const drive = google.drive({ version: "v3", auth });

  const folderName = `${studentName} (ID-${leadId})`;

  // Already exists?
  const existing = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${PARENT_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id, name)",
  });

  if (existing.data.files.length > 0) {
    return existing.data.files[0].id;
  }

  // Create new
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [PARENT_FOLDER_ID],
    },
    fields: "id",
  });

  return folder.data.id;
}

export async function uploadFileToDrive(fileBuffer, fileName, mimeType, folderId) {
  const auth = await getAuth();
  const drive = google.drive({ version: "v3", auth });

  const stream = Readable.from(fileBuffer);



  // Anyone with link can view
const response = await drive.files.create({
  requestBody: {
    name: fileName,
    parents: [folderId],
  },
  media: {
    mimeType,
    body: stream,
  },
  fields: "id, webViewLink, name",
  supportsAllDrives: true,  // ✅ ADD
});

  return {
    driveFileId: response.data.id,
    driveViewLink: response.data.webViewLink,
  };
}