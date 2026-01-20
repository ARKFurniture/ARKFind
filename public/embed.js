(() => {
  const script = document.currentScript;
  const base = (script && script.dataset && script.dataset.arkBase) ? script.dataset.arkBase : new URL(script.src).origin;

  const containers = document.querySelectorAll('[data-ark-furniture-finder], #ark-furniture-finder');
  if (!containers.length) return;

  const src = `${base}/widget?embed=1&shop=${encodeURIComponent(location.hostname)}&ref=${encodeURIComponent(location.href)}`;

  containers.forEach((container) => {
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.style.width = '100%';
    iframe.style.border = '0';
    iframe.style.display = 'block';
    iframe.style.overflow = 'hidden';
    iframe.style.minHeight = '700px';
    iframe.loading = 'lazy';

    container.innerHTML = '';
    container.appendChild(iframe);

    const onMessage = (event) => {
      // Only accept messages from our iframe
      try {
        const origin = new URL(base).origin;
        if (event.origin !== origin) return;
      } catch {
        // ignore
      }

      const data = event.data || {};
      if (data.arkFurnitureFinder === 'resize' && typeof data.height === 'number') {
        iframe.style.height = `${Math.max(700, data.height)}px`;
      }
    };

    window.addEventListener('message', onMessage);
  });
})();
