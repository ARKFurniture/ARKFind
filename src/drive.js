import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { google } from 'googleapis';

let cached = { drive: null, auth: null, keyFilePath: null };

function writeServiceAccountKeyToTmp(base64Json) {
  const buf = Buffer.from(base64Json, 'base64');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-drive-key-'));
  const keyFilePath = path.join(tmpDir, 'service-account.json');
  fs.writeFileSync(keyFilePath, buf);
  return keyFilePath;
}

export function getDriveClient(cfg) {
  if (cached.drive) return cached.drive;

  let keyFile = cfg.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFile && cfg.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64) {
    keyFile = writeServiceAccountKeyToTmp(cfg.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64);
    cached.keyFilePath = keyFile;
  }

  if (!keyFile) {
    throw new Error(
      'Google Drive is not configured. Set GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 (recommended) or GOOGLE_APPLICATION_CREDENTIALS.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });

  const drive = google.drive({ version: 'v3', auth });
  cached = { ...cached, auth, drive };
  return drive;
}

export async function listSubfolders({ drive, rootFolderId }) {
  const out = [];
  let pageToken = undefined;

  do {
    const res = await drive.files.list({
      q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'nextPageToken, files(id,name)',
      pageSize: 1000,
      pageToken
    });

    out.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return out; // [{id,name}]
}

export async function listImagesInFolder({ drive, folderId, max = 1000 }) {
  const out = [];
  let pageToken = undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
      fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,size)',
      pageSize: Math.min(1000, max - out.length),
      pageToken,
      orderBy: 'modifiedTime desc'
    });

    out.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken ?? undefined;

    if (out.length >= max) break;
  } while (pageToken);

  return out;
}

export async function getFileStream({ drive, fileId }) {
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );
  return res.data; // stream
}

export async function getFileMetadata({ drive, fileId }) {
  const res = await drive.files.get({ fileId, fields: 'id,name,mimeType,size,modifiedTime' });
  return res.data;
}
