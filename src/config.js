import { z } from 'zod';

const boolFromEnv = (v, def) => {
  if (v == null) return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};

const schema = z.object({
  PORT: z.coerce.number().default(8080),

  // Google Drive
  DRIVE_ROOT_FOLDER_ID: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_KEY_BASE64: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  // Embedding / security
  FRAME_ANCESTORS: z.string().default('*'),

  // Images
  THUMBNAIL_SIZE: z.coerce.number().default(512),
  ENABLE_THUMBNAILS: z.string().optional(),
  MAX_IMAGES_PER_TYPE: z.coerce.number().default(300),

  // Lead delivery
  LEAD_TO_EMAIL: z.string().email().optional(),
  LEAD_FROM_EMAIL: z.string().email().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  WEBHOOK_URL: z.string().url().optional(),

  // Optional: local images fallback (for dev)
  LOCAL_IMAGES_DIR: z.string().default('./local-images')
});

export function getConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${msg}`);
  }

  const cfg = parsed.data;

  return {
    ...cfg,
    ENABLE_THUMBNAILS: boolFromEnv(cfg.ENABLE_THUMBNAILS, true)
  };
}
