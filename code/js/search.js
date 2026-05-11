function buildAbbr(name) {
  if (!name) return '';
  const parts = [];
  try {
    if (window.pinyinPro && typeof window.pinyinPro.pinyin === 'function') {
      const py = window.pinyinPro.pinyin(name, {
        pattern: 'first',
        toneType: 'none',
        type: 'string',
        nonZh: 'removed',
      });
      const clean = (py || '').toLowerCase().replace(/\s+/g, '');
      if (clean) parts.push(clean);
    }
  } catch (_) {}
  const firstChar = name.charAt(0);
  const isFirstUpper = firstChar >= 'A' && firstChar <= 'Z';
  const upperLetters = (name.match(/[A-Z]/g) || []).join('').toLowerCase();
  if (upperLetters) {
    parts.push(isFirstUpper ? upperLetters : firstChar.toLowerCase() + upperLetters);
  }
  const words = name.split(/[\s\-_./]+/).filter(Boolean);
  if (words.length > 1) {
    parts.push(words.map((w) => w[0]).join('').toLowerCase());
  }
  return parts.join(' ');
}

const searchEngine = {
  projects: [],
  fuse: null,

  build(projects) {
    this.projects = projects.map((p) => ({
      ...p,
      _abbr: buildAbbr(p.name),
    }));
    if (typeof window.Fuse === 'undefined') {
      this.fuse = null;
      return;
    }
    this.fuse = new window.Fuse(this.projects, {
      keys: [
        { name: 'name', weight: 0.4 },
        { name: 'path_with_namespace', weight: 0.3 },
        { name: '_abbr', weight: 0.2 },
        { name: 'description', weight: 0.1 },
      ],
      threshold: 0.35,
      ignoreLocation: true,
      includeScore: true,
      minMatchCharLength: 1,
      useExtendedSearch: false,
    });
  },

  query(q, limit) {
    limit = limit || 100;
    q = (q || '').trim();
    if (!q) {
      return this.projects
        .slice()
        .sort((a, b) => {
          const ta = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
          const tb = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
          return tb - ta;
        })
        .slice(0, limit);
    }
    if (!this.fuse) {
      const lq = q.toLowerCase();
      return this.projects
        .filter((p) => {
          return (
            (p.name || '').toLowerCase().includes(lq) ||
            (p.path_with_namespace || '').toLowerCase().includes(lq) ||
            (p._abbr || '').includes(lq) ||
            (p.description || '').toLowerCase().includes(lq)
          );
        })
        .slice(0, limit);
    }
    const results = this.fuse.search(q, { limit });
    results.sort((a, b) => {
      if (Math.abs(a.score - b.score) < 0.05) {
        return (b.item.star_count || 0) - (a.item.star_count || 0);
      }
      return a.score - b.score;
    });
    return results.map((r) => r.item);
  },
};

// 显式挂到 window，便于跨 <script> 访问（浏览器 classic script 本就共享全局，这里是保险）
if (typeof window !== 'undefined') {
  window.searchEngine = searchEngine;
  window.buildAbbr = buildAbbr;
}
