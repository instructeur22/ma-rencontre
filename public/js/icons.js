const SVG_PATHS = {
  cauris:
    '<ellipse cx="12" cy="12" rx="7" ry="9" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M12 3.5v17M9.5 6.5c1.5 1 3.5 1 5 0M9 12c1.8 1 4.2 1 6 0M9.5 17.5c1.5-1 3.5-1 5 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  shieldCheck:
    '<path d="M12 3l7 3v5c0 5-3.2 8.7-7 10-3.8-1.3-7-5-7-10V6l7-3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="none"/><path d="M9 12.2l2 2 4-4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  mic:
    '<rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
  gift:
    '<rect x="3.5" y="9" width="17" height="11.5" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M3.5 9h17v3.5h-17zM12 9v11.5M12 9c-1.8 0-3.5-1.2-3.5-2.8S9.8 3.5 11 4.5C11.7 5.1 12 7 12 9zm0 0c1.8 0 3.5-1.2 3.5-2.8S14.2 3.5 13 4.5C12.3 5.1 12 7 12 9z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"/>',
  mapPin:
    '<path d="M12 21s6.5-5.7 6.5-11a6.5 6.5 0 10-13 0c0 5.3 6.5 11 6.5 11z" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="12" cy="10" r="2.3" stroke="currentColor" stroke-width="1.8" fill="none"/>',
  spark:
    '<path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9L12 3z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" fill="none"/>',
  heart:
    '<path d="M12 20s-7.5-4.7-7.5-10A4.3 4.3 0 0112 6.8 4.3 4.3 0 0119.5 10c0 5.3-7.5 10-7.5 10z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="currentColor"/>',
  close:
    '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  rewind:
    '<path d="M4.5 9.5A8 8 0 116 17.3M4.5 5v4.5H9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  plane:
    '<path d="M21 15v-2l-8-5V3.5a1.5 1.5 0 00-3 0V8l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-5.5l8 2.5z" fill="currentColor"/>',
  eye:
    '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="12" cy="12" r="2.7" stroke="currentColor" stroke-width="1.8" fill="none"/>',
  eyeOff:
    '<path d="M3 3l18 18M10.6 10.6a2.5 2.5 0 003.4 3.4M6.5 6.8C4.1 8.4 2.5 12 2.5 12s3.5 6 9.5 6c1.9 0 3.6-.5 5-1.3M14.2 6.3A9.7 9.7 0 0121.5 12s-1.2 2.1-3.3 3.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
  bolt:
    '<path d="M13 2L4.5 13.5H11L10 22l9.5-12H13L13 2z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" fill="none"/>',
  check:
    '<path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15.5" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M3.5 9.5h17M8 3.5V6M16 3.5V6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  camera:
    '<path d="M4 8.5A2.5 2.5 0 016.5 6h1.6l1.3-2h5.2l1.3 2h1.6A2.5 2.5 0 0120 8.5v9A2.5 2.5 0 0117.5 20h-11A2.5 2.5 0 014 17.5v-9z" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="12" cy="13" r="3.2" stroke="currentColor" stroke-width="1.8" fill="none"/>',
  play:
    '<path d="M8 5.5l10 6.5-10 6.5V5.5z" fill="currentColor"/>',
  pause:
    '<rect x="7" y="5.5" width="3.5" height="13" rx="1" fill="currentColor"/><rect x="13.5" y="5.5" width="3.5" height="13" rx="1" fill="currentColor"/>',
  compass:
    '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M15.5 8.5l-2 5.2-5 1.8 2-5.2 5-1.8z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"/>',
  message:
    '<path d="M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v8a2.5 2.5 0 01-2.5 2.5H9l-4.5 3v-3A2.5 2.5 0 014 14.5v-8z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="none"/>',
  user:
    '<circle cx="12" cy="8.5" r="3.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M5 19.5c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
  sun:
    '<circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  lock:
    '<rect x="5" y="11" width="14" height="9.5" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M8 11V7.5a4 4 0 018 0V11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
};

export function iconSvg(name, className = 'ak-ico') {
  const pathMarkup = SVG_PATHS[name] || SVG_PATHS.spark;
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${pathMarkup}</svg>`;
}

export function hydrateStaticIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon');
    const cls = el.getAttribute('data-icon-class') || 'ak-ico';
    el.innerHTML = iconSvg(name, cls);
  });
}
