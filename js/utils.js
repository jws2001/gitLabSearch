const DB_KEYS = {
  CONFIG: 'config:gitlab',
  PROJECTS: 'projects:list',
  HISTORY: 'history:search',
};
if (typeof window !== 'undefined') {
  window.DB_KEYS = DB_KEYS;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function debounce(fn, wait) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function relativeTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return '刚刚';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const dd = Math.floor(h / 24);
  if (dd < 30) return `${dd} 天前`;
  const mo = Math.floor(dd / 30);
  if (mo < 12) return `${mo} 个月前`;
  const y = Math.floor(dd / 365);
  return `${y} 年前`;
}

function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function firstChar(name) {
  if (!name) return '?';
  const ch = name.trim().charAt(0);
  return ch.toUpperCase();
}

function avatarColor(id) {
  const palette = ['#fc6d26', '#3370ff', '#00b42a', '#7f37ff', '#ff7d00', '#ee0979', '#0d9488', '#dc2626'];
  const n = typeof id === 'number' ? id : String(id || '').length;
  return palette[Math.abs(n) % palette.length];
}

function highlight(text, query) {
  if (!query || !text) return escapeHtml(text || '');
  const q = query.trim();
  if (!q) return escapeHtml(text);
  const chars = Array.from(q).filter((c) => /\S/.test(c));
  if (!chars.length) return escapeHtml(text);
  const pattern = chars.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  try {
    const re = new RegExp(`(${pattern})`, 'gi');
    return escapeHtml(text).replace(re, '<mark>$1</mark>');
  } catch (_) {
    return escapeHtml(text);
  }
}
