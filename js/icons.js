// ---------------------------------------------------------------------------
// Popshot — inline SVG icon set
// Hand-drawn stroke icons on a 24-unit grid, all currentColor, so they take
// the surrounding text color. Use `icon('name')` for dynamic markup, or put
// `data-icon="name"` on an element and call `mountIcons()` once.
// ---------------------------------------------------------------------------

export const ICONS = {
  logo:      '<path d="M12 2.5l2.1 6.1 6.4 1.4-6.4 1.4L12 17.5l-2.1-6.1-6.4-1.4 6.4-1.4z" fill="currentColor" stroke="none"/>',
  templates: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  sliders:   '<line x1="4" y1="7" x2="20" y2="7"/><circle cx="9.5" cy="7" r="2.2"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2.2"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="7.5" cy="17" r="2.2"/>',
  type:      '<polyline points="5 8 5 5 19 5 19 8"/><line x1="12" y1="5" x2="12" y2="19"/><line x1="9" y1="19" x2="15" y2="19"/>',
  film:      '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><line x1="7.5" y1="4.5" x2="7.5" y2="19.5"/><line x1="16.5" y1="4.5" x2="16.5" y2="19.5"/><line x1="3.5" y1="9.5" x2="7.5" y2="9.5"/><line x1="3.5" y1="14.5" x2="7.5" y2="14.5"/><line x1="16.5" y1="9.5" x2="20.5" y2="9.5"/><line x1="16.5" y1="14.5" x2="20.5" y2="14.5"/>',
  image:     '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="M20.5 15.5l-4.5-4.5-8 8.5"/>',
  sparkle:   '<path d="M12 3.5l1.8 5.2 5.7 1.3-5.7 1.3L12 16.5l-1.8-5.2-5.7-1.3 5.7-1.3z"/>',
  sparkles:  '<path d="M9 4l1.1 3.2 3.4 1.1-3.4 1.2L9 12.7 7.9 9.5 4.5 8.3l3.4-1.1z"/><path d="M17.3 13.2l.8 2.2 2.4.8-2.4.9-.8 2.2-.8-2.2-2.4-.9 2.4-.8z"/>',
  gear:      '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/>',
  play:      '<polygon points="8 5.5 18.5 12 8 18.5" fill="currentColor" stroke="none"/>',
  pause:     '<rect x="6.5" y="5.5" width="3.6" height="13" rx="1" fill="currentColor" stroke="none"/><rect x="13.9" y="5.5" width="3.6" height="13" rx="1" fill="currentColor" stroke="none"/>',
  volume:    '<polygon points="4.5 9.5 8 9.5 12.5 5.5 12.5 18.5 8 14.5 4.5 14.5"/><path d="M15.5 8.8a4.6 4.6 0 010 6.4"/>',
  volumeX:   '<polygon points="4.5 9.5 8 9.5 12.5 5.5 12.5 18.5 8 14.5 4.5 14.5"/><line x1="16" y1="9.8" x2="20.4" y2="14.2"/><line x1="20.4" y1="9.8" x2="16" y2="14.2"/>',
  download:  '<path d="M12 3.5v11"/><polyline points="7.5 10.5 12 15 16.5 10.5"/><path d="M4.5 19.5h15"/>',
  undo:      '<polyline points="8.5 5.5 4 10 8.5 14.5"/><path d="M4 10h9.5a6 6 0 016 6v1.5"/>',
  redo:      '<polyline points="15.5 5.5 20 10 15.5 14.5"/><path d="M20 10h-9.5a6 6 0 00-6 6v1.5"/>',
  plus:      '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  arrow:     '<line x1="4.5" y1="12" x2="19" y2="12"/><polyline points="13.5 6.5 19 12 13.5 17.5"/>',
  scissors:  '<circle cx="6" cy="6.5" r="2.4"/><circle cx="6" cy="17.5" r="2.4"/><line x1="8" y1="8" x2="19.5" y2="19"/><line x1="8" y1="16" x2="19.5" y2="5"/>',
  restore:   '<polyline points="3.5 5 3.5 10 8.5 10"/><path d="M4.6 13.5a8 8 0 102-8.3L3.5 8"/>',
  copy:      '<rect x="9.5" y="9.5" width="10.5" height="10.5" rx="2"/><path d="M5 14.5V6a2 2 0 012-2h8.5"/>',
  x:         '<line x1="6.5" y1="6.5" x2="17.5" y2="17.5"/><line x1="17.5" y1="6.5" x2="6.5" y2="17.5"/>',
  check:     '<polyline points="4.5 12.5 9.9 18 19.5 6.5"/>',
  warning:   '<path d="M12 4L2.8 19.5h18.4z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="16.4" x2="12" y2="16.6"/>',
  zoom:      '<circle cx="11" cy="11" r="6"/><line x1="15.6" y1="15.6" x2="20.5" y2="20.5"/><line x1="11" y1="8.4" x2="11" y2="13.6"/><line x1="8.4" y1="11" x2="13.6" y2="11"/>',
  chip:      '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M10 3v3.5M14 3v3.5M10 17.5V21M14 17.5V21M3 10h3.5M3 14h3.5M17.5 10H21M17.5 14H21"/>',
  wave:      '<path d="M3.5 12h2.5l2.5 5 4-10.5 2.5 5.5h5.5"/>',
  progress:  '<rect x="3.5" y="10" width="17" height="4" rx="2"/><rect x="3.5" y="10" width="9" height="4" rx="2" fill="currentColor" stroke="none"/>',
  home:      '<path d="M4.5 10.5L12 4l7.5 6.5"/><path d="M6.5 9.8V19.5h11V9.8"/>',
  clip:      '<rect x="3.5" y="6" width="13" height="12" rx="2"/><polygon points="16.5 10.5 20.5 8 20.5 16 16.5 13.5" fill="currentColor" stroke="none"/>',
  target:    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none"/>',
};

export function icon(name, cls = 'icon') {
  const body = ICONS[name] || ICONS.sparkle;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

// Fill every [data-icon] placeholder in the document (idempotent).
export function mountIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    el.innerHTML = icon(el.dataset.icon, el.dataset.iconClass || 'icon');
  });
}
