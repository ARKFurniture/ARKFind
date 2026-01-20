import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';

function hasSmtp(cfg) {
  return Boolean(cfg.SMTP_HOST && cfg.SMTP_PORT && cfg.SMTP_USER && cfg.SMTP_PASS && cfg.LEAD_TO_EMAIL);
}

function transport(cfg) {
  return nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port: cfg.SMTP_PORT,
    secure: Number(cfg.SMTP_PORT) === 465,
    auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS }
  });
}

function esc(str) {
  return String(str ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

export async function deliverLead(cfg, lead) {
  // 1) Webhook (Zapier/Make/etc)
  if (cfg.WEBHOOK_URL) {
    try {
      const res = await fetch(cfg.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(lead)
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn(`WEBHOOK_URL responded ${res.status}: ${text}`);
      }
    } catch (e) {
      console.warn('Webhook delivery failed:', e);
    }
  }

  // 2) Email (recommended for v1)
  if (hasSmtp(cfg)) {
    const from = cfg.LEAD_FROM_EMAIL || cfg.SMTP_USER;
    const to = cfg.LEAD_TO_EMAIL;

    const subject = `New Furniture Finder Lead — ${lead.selectedTypeLabel || lead.selectedTypeKey || 'Unknown type'}`;

    const selectedList = (lead.selectedImageIds || []).map(id => `<li><code>${esc(id)}</code></li>`).join('');

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.4;">
        <h2 style="margin: 0 0 8px 0;">New Furniture Finder Lead</h2>
        <p style="margin: 0 0 12px 0;"><strong>Lead ID:</strong> ${esc(lead.id)}<br/>
        <strong>Time:</strong> ${esc(lead.createdAt)}<br/>
        <strong>Source:</strong> ${esc(lead.referrer || '')}</p>

        <h3 style="margin: 16px 0 6px 0;">What they clicked</h3>
        <p style="margin: 0 0 10px 0;"><strong>Furniture type:</strong> ${esc(lead.selectedTypeLabel || lead.selectedTypeKey)}</p>

        ${lead.noneSelected ? `
          <p style="margin: 0 0 10px 0;"><strong>None of these</strong> selected</p>
          <p style="margin: 0 0 10px 0;"><strong>Description:</strong><br/>${esc(lead.noneDescription || '')}</p>
        ` : `
          <p style="margin: 0 0 6px 0;"><strong>Selected images (${(lead.selectedImageIds || []).length}):</strong></p>
          <ul style="margin: 0 0 10px 18px; padding: 0;">${selectedList || '<li><em>(none)</em></li>'}</ul>
        `}

        <h3 style="margin: 16px 0 6px 0;">Contact</h3>
        <p style="margin: 0 0 10px 0;">
          <strong>Name:</strong> ${esc(lead.contact?.name || '')}<br/>
          <strong>Email:</strong> ${esc(lead.contact?.email || '')}<br/>
          <strong>Phone:</strong> ${esc(lead.contact?.phone || '')}<br/>
          <strong>Location:</strong> ${esc(lead.contact?.location || '')}
        </p>

        ${lead.contact?.notes ? `<p style="margin: 0 0 10px 0;"><strong>Notes / constraints:</strong><br/>${esc(lead.contact.notes)}</p>` : ''}
      </div>
    `;

    const tx = transport(cfg);
    await tx.sendMail({ from, to, subject, html });
    return { emailed: true };
  }

  // 3) Fallback: append to a local file (use a Fly volume if you want persistence)
  try {
    const dir = path.resolve('./data');
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, 'leads.jsonl'), JSON.stringify(lead) + '\n', 'utf8');
  } catch (e) {
    console.warn('Could not write local leads file:', e);
  }

  return { emailed: false };
}
