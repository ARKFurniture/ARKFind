import 'dotenv/config';

import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

import { getConfig } from './config.js';
import { createCatalogService } from './catalog.js';
import { getDriveClient, getFileStream, getFileMetadata } from './drive.js';
import { deliverLead } from './mailer.js';
import { typeLabel } from './furnitureTypes.js';

const cfg = getConfig();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// IMPORTANT: allow embedding in Shopify iframes.
app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: false
}));

// Limit embedding to your domains by setting FRAME_ANCESTORS.
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', `frame-ancestors ${cfg.FRAME_ANCESTORS};`);
  next();
});

app.use(morgan('tiny'));
app.use(express.json({ limit: '1mb' }));

// Static assets
const publicDir = path.join(__dirname, '..', 'public');
app.use('/assets', express.static(publicDir, { maxAge: '7d' }));

// Optional local image fallback for dev:
app.use('/local-images', express.static(path.resolve(cfg.LOCAL_IMAGES_DIR), { maxAge: '7d' }));

const catalog = createCatalogService(cfg);

app.get('/healthz', (req, res) => res.status(200).send('ok'));

app.get('/widget', (req, res) => {
  res.sendFile(path.join(publicDir, 'widget.html'));
});

// Convenience: embed script that inserts an iframe and autoresizes.
app.get('/embed.js', (req, res) => {
  res.setHeader('content-type', 'application/javascript; charset=utf-8');
  res.sendFile(path.join(publicDir, 'embed.js'));
});

app.get('/api/types', async (req, res) => {
  try {
    const types = await catalog.getTypes({ thumbnailSize: cfg.THUMBNAIL_SIZE });
    res.json({
      source: catalog.getSource(),
      types
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load catalog. Check Drive config.' });
  }
});

app.get('/api/type/:key', async (req, res) => {
  const key = req.params.key;
  try {
    const images = await catalog.getImagesForType({ key, thumbnailSize: cfg.THUMBNAIL_SIZE });
    if (!images) return res.status(404).json({ error: 'Unknown type' });
    res.json({ key, label: typeLabel(key), images });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load type images.' });
  }
});

// Image proxy + square crop thumbnail.
// - For Drive: :id is a Drive fileId.
// - For local mode: not used.
const thumbCache = new Map();
const THUMB_CACHE_MAX = 400;
const THUMB_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheGet(key) {
  const hit = thumbCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    thumbCache.delete(key);
    return null;
  }
  // refresh LRU order
  thumbCache.delete(key);
  thumbCache.set(key, hit);
  return hit;
}

function cacheSet(key, value) {
  if (thumbCache.size >= THUMB_CACHE_MAX) {
    const firstKey = thumbCache.keys().next().value;
    if (firstKey) thumbCache.delete(firstKey);
  }
  thumbCache.set(key, value);
}

app.get('/img/:id', async (req, res) => {
  const fileId = req.params.id;
  const size = Math.max(128, Math.min(1024, Number(req.query.size ?? cfg.THUMBNAIL_SIZE)));
  const cacheKey = `${fileId}:${size}`;

  const cachedThumb = cacheGet(cacheKey);
  if (cachedThumb) {
    res.setHeader('content-type', cachedThumb.contentType);
    res.setHeader('cache-control', 'public, max-age=604800, immutable');
    return res.status(200).send(cachedThumb.buf);
  }

  try {
    const drive = getDriveClient(cfg);


    // If you ever need to disable server-side square thumbnails (e.g., for uncommon image formats),
    // set ENABLE_THUMBNAILS=false and the original image will be streamed instead.
    if (!cfg.ENABLE_THUMBNAILS) {
      const meta = await getFileMetadata({ drive, fileId });
      const stream = await getFileStream({ drive, fileId });
      res.setHeader('content-type', meta?.mimeType || 'application/octet-stream');
      res.setHeader('cache-control', 'public, max-age=604800');
      stream.on('error', (err) => {
        console.error('Drive stream error:', err);
        if (!res.headersSent) res.status(500).end();
      });
      return stream.pipe(res);
    }


    // Stream from Drive -> crop square -> return jpeg
    const stream = await getFileStream({ drive, fileId });

    const transformer = sharp()
      .rotate()
      .resize(size, size, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 82, mozjpeg: true });

    const chunks = [];
    let total = 0;
    transformer.on('data', (c) => {
      chunks.push(c);
      total += c.length;
      if (total > 5 * 1024 * 1024) {
        // Safety: abort very large outputs (shouldn't happen at these sizes).
        transformer.destroy(new Error('Thumbnail too large'));
      }
    });

    transformer.on('error', (err) => {
      console.error('Thumbnail transform error:', err);
      if (!res.headersSent) res.status(500).end();
    });

    transformer.on('end', () => {
      const buf = Buffer.concat(chunks);
      const value = { buf, contentType: 'image/jpeg', expiresAt: Date.now() + THUMB_CACHE_TTL_MS };
      cacheSet(cacheKey, value);

      res.setHeader('content-type', 'image/jpeg');
      res.setHeader('cache-control', 'public, max-age=604800, immutable');
      res.status(200).send(buf);
    });

    stream.on('error', (err) => {
      console.error('Drive stream error:', err);
      if (!res.headersSent) res.status(500).end();
    });

    stream.pipe(transformer);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Image error (Drive config?)' });
  }
});

const LeadSchema = z.object({
  selectedTypeKey: z.string().min(1),
  selectedImageIds: z.array(z.string()).default([]),
  noneSelected: z.boolean().default(false),
  noneDescription: z.string().optional(),
  contact: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional().default(''),
    location: z.string().optional().default(''),
    notes: z.string().optional().default(''),
    // spam honeypot
    website: z.string().optional().default('')
  }),
  context: z.object({
    pageUrl: z.string().optional().default(''),
    referrer: z.string().optional().default(''),
    shopDomain: z.string().optional().default('')
  }).default({})
});

app.post('/api/submit', async (req, res) => {
  try {
    const parsed = LeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });
    }

    const body = parsed.data;

    // basic anti-spam
    if (body.contact.website && body.contact.website.trim().length > 0) {
      return res.status(200).json({ ok: true });
    }

    if (body.noneSelected) {
      body.selectedImageIds = [];
    }

    const lead = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      selectedTypeKey: body.selectedTypeKey,
      selectedTypeLabel: typeLabel(body.selectedTypeKey),
      selectedImageIds: body.selectedImageIds,
      noneSelected: body.noneSelected,
      noneDescription: body.noneDescription || '',
      contact: {
        name: body.contact.name,
        email: body.contact.email,
        phone: body.contact.phone,
        location: body.contact.location,
        notes: body.contact.notes
      },
      pageUrl: body.context?.pageUrl || '',
      referrer: body.context?.referrer || '',
      shopDomain: body.context?.shopDomain || '',
      userAgent: req.headers['user-agent'] || ''
    };

    await deliverLead(cfg, lead);

    res.json({ ok: true, leadId: lead.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Submit failed' });
  }
});

// Redirect root to /widget for convenience
app.get('/', (req, res) => res.redirect('/widget'));

app.listen(cfg.PORT, () => {
  console.log(`ARK Furniture Finder running on port ${cfg.PORT}`);
  console.log(`Catalog source: ${cfg.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 || cfg.GOOGLE_APPLICATION_CREDENTIALS ? 'Google Drive' : 'local'}`);
});
