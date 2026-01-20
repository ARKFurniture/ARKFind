import fs from 'node:fs/promises';
import path from 'node:path';
import { FURNITURE_TYPES } from './furnitureTypes.js';
import { getDriveClient, listImagesInFolder, listSubfolders } from './drive.js';

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

function isImageFile(name) {
  const lower = name.toLowerCase();
  return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp') || lower.endsWith('.gif');
}

export function createCatalogService(cfg) {
  const cache = {
    builtAt: 0,
    types: new Map(), // key -> { folderId, images: [{id,name,mimeType}] }
    source: 'none'
  };

  async function refreshFromDrive() {
    const drive = getDriveClient(cfg);
    if (!cfg.DRIVE_ROOT_FOLDER_ID) {
      throw new Error('DRIVE_ROOT_FOLDER_ID is required when using Google Drive.');
    }

    const folders = await listSubfolders({ drive, rootFolderId: cfg.DRIVE_ROOT_FOLDER_ID });
    const folderByName = new Map(folders.map(f => [f.name, f.id]));

    const newTypes = new Map();

    for (const t of FURNITURE_TYPES) {
      const folderId = folderByName.get(t.key);
      if (!folderId) continue;

      const images = await listImagesInFolder({ drive, folderId, max: cfg.MAX_IMAGES_PER_TYPE });
      newTypes.set(t.key, { folderId, images });
    }

    cache.types = newTypes;
    cache.builtAt = Date.now();
    cache.source = 'drive';
  }

  async function refreshFromLocal() {
    const base = path.resolve(cfg.LOCAL_IMAGES_DIR);
    const newTypes = new Map();

    for (const t of FURNITURE_TYPES) {
      const dir = path.join(base, t.key);
      try {
        const files = await fs.readdir(dir);
        const images = files
          .filter(isImageFile)
          .map((name) => ({ id: `${t.key}/${name}`, name, mimeType: undefined }));

        if (images.length > 0) {
          newTypes.set(t.key, { folderId: dir, images });
        }
      } catch {
        // ignore missing folders
      }
    }

    cache.types = newTypes;
    cache.builtAt = Date.now();
    cache.source = 'local';
  }

  async function ensureFresh() {
    const now = Date.now();
    if (cache.builtAt && (now - cache.builtAt) < DEFAULT_TTL_MS) return;

    if (cfg.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 || cfg.GOOGLE_APPLICATION_CREDENTIALS) {
      await refreshFromDrive();
      return;
    }

    await refreshFromLocal();
  }

  function getTypeKeysAvailable() {
    return FURNITURE_TYPES
      .map(t => t.key)
      .filter(key => cache.types.has(key));
  }

  function pickRandom(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function imageUrlFor({ fileId, size }) {
    if (cache.source === 'drive') {
      return `/img/${encodeURIComponent(fileId)}?size=${encodeURIComponent(size)}`;
    }
    // local: fileId is like "DiningTable/foo.jpg"; keep the slash.
    return `/local-images/${encodeURI(fileId)}`;
  }

  async function getTypes({ thumbnailSize }) {
    await ensureFresh();

    const types = [];
    for (const t of FURNITURE_TYPES) {
      const entry = cache.types.get(t.key);
      if (!entry) continue;
      const cover = pickRandom(entry.images);
      types.push({
        key: t.key,
        label: t.label,
        count: entry.images.length,
        cover: cover
          ? { id: cover.id, name: cover.name, url: imageUrlFor({ fileId: cover.id, size: thumbnailSize }) }
          : null
      });
    }

    return types;
  }

  async function getImagesForType({ key, thumbnailSize }) {
    await ensureFresh();
    const entry = cache.types.get(key);
    if (!entry) return null;

    return entry.images.map(img => ({
      id: img.id,
      name: img.name,
      url: imageUrlFor({ fileId: img.id, size: thumbnailSize })
    }));
  }

  return {
    ensureFresh,
    getTypes,
    getImagesForType,
    getTypeKeysAvailable,
    getSource: () => cache.source
  };
}
