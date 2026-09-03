// ---------------------------------------------------------------------------
// Popshot — nav behaviour
// The animations mega-menu and, below 700px, the whole link row: both are
// plain markup that works without this file, so this only adds the toggling.
// ---------------------------------------------------------------------------

const isMobile = () => window.matchMedia('(max-width: 700px)').matches;

const drop = document.querySelector('[data-navdrop]');
const panel = drop?.querySelector('.nav-panel');
const dropBtn = drop?.querySelector('.nav-drop-btn');
const nav = document.querySelector('.nav');
const toggle = document.getElementById('navToggle');

function setDrop(open) {
  if (!drop) return;
  panel.hidden = !open;
  dropBtn.setAttribute('aria-expanded', String(open));
  drop.toggleAttribute('data-open', open);
}

const hoverCapable = window.matchMedia('(hover: hover)').matches;

dropBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  // With a mouse, hover already governs the panel: moving to the button opens
  // it, so letting the click toggle too would close it the instant you click.
  // Keyboard activation reports detail 0, and touch has no hover at all.
  const fromKeyboard = e.detail === 0;
  if (hoverCapable && !isMobile() && !fromKeyboard) return;
  setDrop(panel.hidden);
});

// Hover only where hovering is a real input, and never while the mobile
// sheet is open — there the panel is inline, not floating.
if (drop && hoverCapable) {
  let leaveTimer = null;
  const enter = () => { if (!isMobile()) { clearTimeout(leaveTimer); setDrop(true); } };
  const leave = () => { if (!isMobile()) leaveTimer = setTimeout(() => setDrop(false), 160); };
  drop.addEventListener('mouseenter', enter);
  drop.addEventListener('mouseleave', leave);
  panel.addEventListener('mouseenter', enter);
  panel.addEventListener('mouseleave', leave);
}

function closeAll() {
  setDrop(false);
  nav?.classList.remove('open');
  toggle?.setAttribute('aria-expanded', 'false');
}

toggle?.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = !nav.classList.contains('open');
  nav.classList.toggle('open', open);
  toggle.setAttribute('aria-expanded', String(open));
  if (!open) setDrop(false);
});

document.addEventListener('click', (e) => {
  if (!nav?.contains(e.target)) closeAll();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
// following a link inside the sheet should put it away
document.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', closeAll));
window.addEventListener('hashchange', closeAll);
