# ARK Furniture Finder (Embeddable Shopify Widget)

This repo is a small Node/Express app you can deploy on **Fly.io** and embed inside your **Shopify** site.

## What it does

1. **Step 1:** Shows a grid of furniture types (Dining Table, Dresser, Sideboard, etc.)
   - Each tile shows **one random photo** from that folder.
2. **Step 2:** After a user clicks a type, shows **all photos** for that type
   - User can select multiple
   - Includes a **"None of these"** option that reveals a description box
3. **Step 3:** Collects contact info and submits
   - Sends you a lead by **email** (SMTP) and/or a **webhook**

Images come from **Google Drive subfolders** (recommended), or (for local dev) from a `local-images/` folder.

---

## Folder naming (Drive)

Inside one Drive root folder, create subfolders that match these keys:

- `DiningTable`
- `DiningChair`
- `Sideboard`
- `Dresser`
- `Cabinet`
- `CoffeeTable`
- `Bed`
- `Desk`
- `Armoire`
- `Hutch`
- `Sidetable`
- `Chest`
- (optional) `ConsoleTable`
- (optional) `Vanity`

These are defined in `src/furnitureTypes.js`.

---

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

Open:

- `http://localhost:8080/widget`

If you want to test without Drive, you can create:

```
local-images/
  DiningTable/
    DiningTable1.JPG
  Dresser/
    Dresser1.JPG
  ...
```

Then the app will use local images automatically.

---

## Google Drive setup (recommended)

This widget uses a **service account** to read images from your Drive.

### A) Create a service account

1. Create a Google Cloud project
2. Enable the **Google Drive API**
3. Create a **Service Account**
4. Create a **JSON key** for the service account and download it

### B) Share the Drive root folder

- In Google Drive, right-click your *root* folder → **Share**
- Add the service account email (looks like `something@something.iam.gserviceaccount.com`)
- Give it **Viewer** access

### C) Configure environment variables

1. Copy your Drive root folder ID from the URL:
   - `https://drive.google.com/drive/folders/<THIS_PART_IS_THE_ID>`
2. Convert the service account JSON to base64:

```bash
base64 -i service-account.json | tr -d '\n'
```

3. Put these in `.env` (or Fly secrets):

- `DRIVE_ROOT_FOLDER_ID=...`
- `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64=...`

---

## Lead delivery (email)

This app can email you a lead using SMTP.

Set:

- `LEAD_TO_EMAIL=you@yourdomain.com`
- `SMTP_HOST=...`
- `SMTP_PORT=587`
- `SMTP_USER=...`
- `SMTP_PASS=...`

If SMTP is not set, leads are appended to `./data/leads.jsonl` (ephemeral unless you attach a Fly volume).

---

## Deploy to Fly.io

1. Install Fly CLI and login
2. From this repo folder:

```bash
fly launch
```

When Fly asks for an internal port, use **8080**.

3. Set secrets:

```bash
fly secrets set \
  DRIVE_ROOT_FOLDER_ID="..." \
  GOOGLE_SERVICE_ACCOUNT_KEY_BASE64="..." \
  FRAME_ANCESTORS="https://YOURSTORE.myshopify.com https://www.YOURDOMAIN.com" \
  LEAD_TO_EMAIL="you@yourdomain.com" \
  SMTP_HOST="..." \
  SMTP_PORT="587" \
  SMTP_USER="..." \
  SMTP_PASS="..."
```

4. Deploy:

```bash
fly deploy
```

---

## Embed in Shopify

### Option 1: Simple iframe (fastest)

Add to a Shopify page / section (Custom Liquid):

```html
<iframe
  src="https://YOURAPP.fly.dev/widget?embed=1&shop={{ shop.domain }}"
  style="width:100%; border:0; min-height:900px;"
  loading="lazy"
></iframe>
```

### Option 2: Auto-resizing embed script (recommended)

Add this where you want the widget:

```html
<div id="ark-furniture-finder"></div>
<script src="https://YOURAPP.fly.dev/embed.js" data-ark-base="https://YOURAPP.fly.dev"></script>
```

The widget will automatically resize its iframe height.

---

## Customizing text / style

- UI copy lives in `public/widget.js`
- Styling lives in `public/widget.css`
- Furniture type list + labels live in `src/furnitureTypes.js`

---

## Notes

- Thumbnails are produced server-side as **square crops** (no stretching) to keep the grid consistent.
- If you have thousands of photos in a folder, you can cap per type with `MAX_IMAGES_PER_TYPE`.

