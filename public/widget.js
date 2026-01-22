const app = document.getElementById('app');

const state = {
  step: 1,
  loading: true,
  types: [],
  selectedType: null,
  images: [],
  selectedImageIds: new Set(),
  noneSelected: false,
  noneDescription: '',
  contact: {
    name: '',
    email: '',
    phone: '',
    location: '',
    notes: '',
    website: '' // honeypot
  },
  context: {
    pageUrl: '',
    referrer: '',
    shopDomain: ''
  },
  error: '',
  submitting: false,
  leadId: null
};

function qs() {
  return new URLSearchParams(location.search);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));
}

function postHeight() {
  try {
    const h = document.documentElement.scrollHeight;
    window.parent?.postMessage({
      arkFurnitureFinder: 'resize',
      height: h
    }, '*');
  } catch {
    // ignore
  }
}

function afterRender() {
  // Defer to allow images to layout
  requestAnimationFrame(() => {
    postHeight();
    setTimeout(postHeight, 300);
    setTimeout(postHeight, 1000);
  });
}

window.addEventListener('resize', () => postHeight());

async function loadTypes() {
  // state.loading is used for page loads; submitting has its own flag
  render();

  try {
    const res = await fetch('/api/types');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load');
    state.types = data.types || [];
    state.loading = false;
    state.error = '';
  } catch (e) {
    state.submitting = false;
    state.error = e?.message || 'Failed to load furniture types.';
  }
  render();
}

async function loadTypeImages(typeKey) {
  // state.loading is used for page loads; submitting has its own flag
  state.selectedImageIds.clear();
  state.noneSelected = false;
  state.noneDescription = '';
  render();

  try {
    const res = await fetch(`/api/type/${encodeURIComponent(typeKey)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load');
    state.images = data.images || [];
    state.loading = false;
    state.error = '';
  } catch (e) {
    state.submitting = false;
    state.error = e?.message || 'Failed to load images.';
  }
  render();
}

function selectType(type) {
  state.selectedType = type;
  state.step = 2;
  loadTypeImages(type.key);
}

function toggleImage(id) {
  if (state.noneSelected) {
    state.noneSelected = false;
    state.noneDescription = '';
  }

  if (state.selectedImageIds.has(id)) state.selectedImageIds.delete(id);
  else state.selectedImageIds.add(id);

  render();
}

function chooseNone() {
  state.selectedImageIds.clear();
  state.noneSelected = true;
  render();
}

function goBack() {
  if (state.step === 2) {
    state.step = 1;
    state.selectedType = null;
    state.images = [];
    state.selectedImageIds.clear();
    state.noneSelected = false;
    state.noneDescription = '';
    render();
    return;
  }
  if (state.step === 3) {
    state.step = 2;
    render();
    return;
  }
}

function canContinueFromStep2() {
  if (state.noneSelected) return (state.noneDescription || '').trim().length >= 5;
  return state.selectedImageIds.size > 0;
}

function continueToForm() {
  if (!canContinueFromStep2()) return;
  state.step = 3;
  render();
}

async function submitLead() {
  state.submitting = true;
  state.error = '';
  render();

  const payload = {
    selectedTypeKey: state.selectedType?.key,
    selectedImageIds: Array.from(state.selectedImageIds),
    noneSelected: state.noneSelected,
    noneDescription: state.noneDescription,
    contact: state.contact,
    context: state.context
  };

  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Submit failed');

    state.submitting = false;
    state.step = 4;
    state.leadId = data.leadId;
  } catch (e) {
    state.submitting = false;
    state.error = e?.message || 'Submit failed.';
  }

  render();
}

function typeGrid() {
  const cards = state.types.map(t => {
    const cover = t.cover?.url ? `<img src="${escapeHtml(t.cover.url)}" alt="${escapeHtml(t.label)}" loading="lazy" decoding="async" />` : '';
    return `
      <button class="tile" data-type="${escapeHtml(t.key)}" aria-label="${escapeHtml(t.label)}">
        <div class="square">${cover}</div>
        <div class="tile-label">${escapeHtml(t.label)}</div>
      </button>
    `;
  }).join('');

  return `
    <div class="header">
      <h1 class="title">Click the type of furniture you’re looking for</h1>
      <p class="subtitle">You’ll pick a few examples next, then we’ll ask for your contact info.</p>
    </div>

    <div class="card">
      <div class="grid">${cards}</div>
    </div>
  `;
}

function imageGrid() {
  const typeLabel = state.selectedType?.label || state.selectedType?.key || '';
  const maxInitial = 60;

  const showing = state.showAllImages ? state.images : state.images.slice(0, maxInitial);

  const tiles = showing.map(img => {
    const selected = state.selectedImageIds.has(img.id);
    return `
      <button class="tile ${selected ? 'selected' : ''}" data-img="${escapeHtml(img.id)}" aria-label="Select image">
        <div class="check" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16.5 6.5L8.5 14.5L3.5 9.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <div class="square"><img src="${escapeHtml(img.url)}" alt="" loading="lazy" decoding="async" /></div>
        <div class="tile-label">Select</div>
      </button>
    `;
  }).join('');

  const noneSelected = state.noneSelected;
  const noneTile = `
    <button class="tile ${noneSelected ? 'selected' : ''}" data-none="1" aria-label="None of these">
      <div class="check" aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16.5 6.5L8.5 14.5L3.5 9.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <div class="square" style="display:grid; place-items:center; padding:14px; text-align:center;">
        <div>
          <div style="font-weight:700;">None of these</div>
          <div class="helper" style="margin-top:6px;">Describe what you want</div>
        </div>
      </div>
      <div class="tile-label">None</div>
    </button>
  `;

  const showMoreBtn = (!state.showAllImages && state.images.length > maxInitial)
    ? `<button class="btn" data-show-more="1">Show ${state.images.length - maxInitial} more</button>`
    : '';

  const descBox = `
    <div class="field ${state.noneSelected ? '' : 'hidden'}" style="margin-top:12px;">
      <label for="noneDescription">Tell us what you’re looking for</label>
      <textarea id="noneDescription" placeholder="Example: solid wood dining table, seats 6, lighter stain, max 72\" long..."></textarea>
      <div class="helper">A few details (size, finish, vibe) helps us source faster.</div>
    </div>
  `;

  return `
    <div class="header">
      <h1 class="title">Select all the pieces you like</h1>
      <p class="subtitle">Type: <strong>${escapeHtml(typeLabel)}</strong> — pick one or a few. Or choose “None of these”.</p>
    </div>

    <div class="card">
      <div class="grid">${tiles}${noneTile}</div>
      ${descBox}
      ${state.submitting ? `<div class="helper" style="margin:0 0 10px; color: var(--muted);">Sending your request…</div>` : ``}

        <div class="controls">
        <button class="btn" data-back="1">Back</button>
        <div style="display:flex; gap:10px; align-items:center;">
          ${showMoreBtn}
          <button class="btn primary" data-continue="1" ${canContinueFromStep2() ? '' : 'disabled'}>Continue</button>
        </div>
      </div>
    </div>
  `;
}

function contactForm() {
  const typeLabel = state.selectedType?.label || state.selectedType?.key || '';
  const pickedCount = state.selectedImageIds.size;

  const pickedLine = state.noneSelected
    ? 'You chose “None of these” and added a description.'
    : `You selected ${pickedCount} piece${pickedCount === 1 ? '' : 's'}.`;

  return `
    <div class="header">
      <h1 class="title">Where should we send pieces?</h1>
      <p class="subtitle">${escapeHtml(typeLabel)} — ${escapeHtml(pickedLine)}</p>
    </div>

    <div class="card">
      <form class="form" id="leadForm">
        <div class="field">
          <label for="name">Name</label>
          <input id="name" name="name" autocomplete="name" required />
        </div>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" autocomplete="email" required />
        </div>
        <div class="field">
          <label for="phone">Phone (optional)</label>
          <input id="phone" name="phone" type="tel" autocomplete="tel" />
        </div>
        <div class="field">
          <label for="location">City / Region (optional)</label>
          <input id="location" name="location" autocomplete="address-level2" />
        </div>
        <div class="field">
          <label for="notes">Notes / constraints (optional)</label>
          <textarea id="notes" name="notes" placeholder="Size, finish, timeline, budget range, etc."></textarea>
        </div>

        <!-- Honeypot field (hidden) -->
        <div class="field hidden" aria-hidden="true">
          <label for="website">Website</label>
          <input id="website" name="website" tabindex="-1" />
        </div>

        ${state.submitting ? `<div class="helper" style="margin:0 0 10px; color: var(--muted);">Sending your request…</div>` : ``}

        <div class="controls">
          <button class="btn" type="button" data-back="1">Back</button>
          <button class="btn primary" id="ark-submit" type="submit" ${state.submitting ? "disabled" : ""}>${state.submitting ? "Sending…" : "Send me pieces"}</button>
        </div>
      </form>
    </div>
  `;
}

function successScreen() {
  return `
    <div class="header">
      <h1 class="title">Got it — we’ll send you options</h1>
      <p class="subtitle">We’ll follow up by email with pieces that match what you picked.</p>
    </div>

    <div class="card">
      <p style="margin:0;">Thank you! If you have more context, reply to our email anytime.</p>
    </div>
  `;
}

function loadingScreen() {
  return `
    <div class="card">
      <p style="margin:0; color: var(--muted);">Loading…</p>
    </div>
  `;
}

function errorBanner() {
  if (!state.error) return '';
  return `
    <div class="card" style="border-color: rgba(220, 38, 38, 0.35); margin-bottom: 12px;">
      <p style="margin:0; color: rgb(185, 28, 28); font-weight: 600;">${escapeHtml(state.error)}</p>
    </div>
  `;
}

function render() {
  let html = '';

  html += errorBanner();

  if (state.loading) {
    html += loadingScreen();
  } else {
    if (state.step === 1) html += typeGrid();
    else if (state.step === 2) html += imageGrid();
    else if (state.step === 3) html += contactForm();
    else html += successScreen();
  }

  app.innerHTML = html;

  // Attach listeners
  if (state.step === 1) {
    app.querySelectorAll('[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-type');
        const type = state.types.find(t => t.key === key);
        if (type) selectType(type);
      });
    });
  }

  if (state.step === 2) {
    app.querySelectorAll('[data-img]').forEach(btn => {
      btn.addEventListener('click', () => toggleImage(btn.getAttribute('data-img')));
    });

    const noneBtn = app.querySelector('[data-none]');
    noneBtn?.addEventListener('click', chooseNone);

    app.querySelector('[data-back]')?.addEventListener('click', goBack);
    app.querySelector('[data-continue]')?.addEventListener('click', continueToForm);

    const showMore = app.querySelector('[data-show-more]');
    showMore?.addEventListener('click', () => {
      state.showAllImages = true;
      render();
    });

    const desc = app.querySelector('#noneDescription');
    if (desc) {
      desc.value = state.noneDescription;
      desc.addEventListener('input', () => {
        state.noneDescription = desc.value;
        // refresh button state
        app.querySelector('[data-continue]')?.toggleAttribute('disabled', !canContinueFromStep2());
      });
    }
  }

  if (state.step === 3) {
    app.querySelector('[data-back]')?.addEventListener('click', goBack);
    const form = app.querySelector('#leadForm');
    if (form) {
      // hydrate existing values (if user goes back and forth)
      form.name.value = state.contact.name;
      form.email.value = state.contact.email;
      form.phone.value = state.contact.phone;
      form.location.value = state.contact.location;
      form.notes.value = state.contact.notes;
      form.website.value = state.contact.website;

      form.addEventListener('submit', (e) => {
        if (state.submitting) return;
        e.preventDefault();
        state.contact.name = form.name.value;
        state.contact.email = form.email.value;
        state.contact.phone = form.phone.value;
        state.contact.location = form.location.value;
        state.contact.notes = form.notes.value;
        state.contact.website = form.website.value;
        submitLead();
      });
    }
  }

  afterRender();
}

// Init context (Shopify page URL etc.)
(function init() {
  const p = qs();
  state.context.pageUrl = p.get('ref') || document.referrer || '';
  state.context.referrer = document.referrer || '';
  state.context.shopDomain = p.get('shop') || '';

  loadTypes();
})();
