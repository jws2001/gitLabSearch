(function () {
  const HISTORY_MAX = 20;

  const searchView = document.getElementById('searchView');
  const settingsView = document.getElementById('settingsView');
  const searchInput = document.getElementById('searchInput');
  const statusEl = document.getElementById('status');
  const listEl = document.getElementById('list');
  const bannerEl = document.getElementById('banner');
  const settingsBtn = document.getElementById('settingsBtn');

  let currentResults = [];
  let activeIndex = 0;
  let currentQuery = '';
  let ready = false;

  // --------- 路由 ---------
  function showView(name) {
    if (name === 'settings') {
      searchView.style.display = 'none';
      settingsView.style.display = 'block';
      if (window.settingsController) window.settingsController.refresh();
    } else {
      settingsView.style.display = 'none';
      searchView.style.display = 'flex';
      init();
    }
  }
  window.router = { showView };

  // --------- 搜索 view ---------
  function showBanner(msg, level) {
    const levels = ['err', 'info', 'success'];
    bannerEl.className = 'banner' + (levels.includes(level) ? ' ' + level : '');
    bannerEl.innerHTML = msg;
    bannerEl.style.display = msg ? 'flex' : 'none';
  }

  function clearBanner() {
    bannerEl.style.display = 'none';
    bannerEl.innerHTML = '';
  }

  function renderEmpty(msg, actionLabel, actionFn) {
    statusEl.textContent = '';
    const btnHtml = actionLabel
      ? `<button id="emptyAction" class="primary">${escapeHtml(actionLabel)}</button>`
      : '';
    listEl.innerHTML = `
      <div class="empty">
        <div class="big">⚙️</div>
        <div>${escapeHtml(msg)}</div>
        ${btnHtml}
      </div>
    `;
    const btn = document.getElementById('emptyAction');
    if (btn && actionFn) btn.addEventListener('click', actionFn);
  }

  function init(payload) {
    clearBanner();
    const config = window.services.db.get(DB_KEYS.CONFIG);
    if (!config || !config.token || !config.baseUrl) {
      ready = false;
      renderEmpty('请先配置 GitLab 地址与 Personal Access Token', '前往设置', () => showView('settings'));
      return;
    }
    const projectsDoc = window.services.db.get(DB_KEYS.PROJECTS);
    if (!projectsDoc || !Array.isArray(projectsDoc.items) || projectsDoc.items.length === 0) {
      ready = false;
      renderEmpty('尚未同步项目，请先同步', '前往设置同步', () => showView('settings'));
      return;
    }
    searchEngine.build(projectsDoc.items);
    ready = true;
    const count = projectsDoc.items.length;
    const updated = projectsDoc.updatedAt ? `${relativeTime(projectsDoc.updatedAt)}更新` : '';
    statusEl.textContent = `${count} 个项目${updated ? ' · ' + updated : ''}`;

    const initial = typeof payload === 'string' ? payload.trim() : '';
    if (initial) {
      searchInput.value = initial;
    }
    doSearch();
    searchInput.focus();
    searchInput.select();
  }

  function doSearch() {
    if (!ready) return;
    const q = searchInput.value;
    currentQuery = q;
    currentResults = searchEngine.query(q, 100);
    activeIndex = 0;
    render();
  }

  function render() {
    if (!currentResults.length) {
      listEl.innerHTML = `
        <div class="empty">
          <div class="big">🔍</div>
          <div>未找到匹配项目</div>
        </div>
      `;
      return;
    }
    const frag = document.createDocumentFragment();
    currentResults.forEach((p, i) => {
      const div = document.createElement('div');
      div.className = 'item' + (i === activeIndex ? ' active' : '');
      div.dataset.index = String(i);
      const nameHtml = highlight(p.name, currentQuery);
      const pathHtml = highlight(p.path_with_namespace, currentQuery);
      const time = relativeTime(p.last_activity_at);
      const fallback = escapeHtml(firstChar(p.name));
      const avatarInner = p.avatar_url
        ? `<img src="${escapeHtml(p.avatar_url)}" onerror="this.replaceWith(document.createTextNode('${fallback}'))" />`
        : fallback;
      const stars = p.star_count ? ` · ⭐ ${p.star_count}` : '';
      div.innerHTML = `
        <div class="avatar" style="background:${avatarColor(p.id)}">${avatarInner}</div>
        <div class="meta">
          <div class="title">${nameHtml}</div>
          <div class="sub">${pathHtml}${time ? ' · ' + time : ''}${stars}</div>
        </div>
        <div class="badges">
          <span class="badge visibility-${escapeHtml(p.visibility)}">${escapeHtml(p.visibility || '')}</span>
        </div>
      `;
      div.addEventListener('click', () => {
        activeIndex = i;
        openProject('web');
      });
      div.addEventListener('mouseenter', () => {
        if (activeIndex !== i) {
          activeIndex = i;
          updateActiveClass();
        }
      });
      frag.appendChild(div);
    });
    listEl.innerHTML = '';
    listEl.appendChild(frag);
    scrollActiveIntoView();
  }

  function updateActiveClass() {
    const items = listEl.querySelectorAll('.item');
    items.forEach((el, i) => {
      el.classList.toggle('active', i === activeIndex);
    });
  }

  function scrollActiveIntoView() {
    const el = listEl.querySelector('.item.active');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }

  function move(delta) {
    if (!currentResults.length) return;
    activeIndex = (activeIndex + delta + currentResults.length) % currentResults.length;
    updateActiveClass();
    scrollActiveIntoView();
  }

  function currentItem() {
    return currentResults[activeIndex];
  }

  function openProject(target) {
    const p = currentItem();
    if (!p) return;
    const web = (p.web_url || '').replace(/\/$/, '');
    const map = {
      web: web,
      mr: `${web}/-/merge_requests`,
      issues: `${web}/-/issues`,
      pipelines: `${web}/-/pipelines`,
    };
    const url = map[target] || web;
    if (!url) return;
    window.services.open(url);
    pushHistory(currentQuery);
    window.services.outPlugin();
  }

  function copyToClipboard(type) {
    const p = currentItem();
    if (!p) return;
    const text = type === 'ssh' ? p.ssh_url_to_repo : p.http_url_to_repo;
    if (!text) {
      window.services.notify('该仓库没有可用的 clone 地址');
      return;
    }
    window.services.copy(text);
    window.services.notify(`已复制 ${type === 'ssh' ? 'SSH' : 'HTTPS'} 地址`);
  }

  function pushHistory(q) {
    q = (q || '').trim();
    if (!q) return;
    const doc = window.services.db.get(DB_KEYS.HISTORY) || { items: [] };
    const items = (doc.items || []).filter((x) => x !== q);
    items.unshift(q);
    window.services.db.put(DB_KEYS.HISTORY, { items: items.slice(0, HISTORY_MAX) });
  }

  // --------- 一键 clone ---------
  let cloning = false;

  function resolveCloneDir() {
    const config = window.services.db.get(DB_KEYS.CONFIG) || {};
    const configured = (config.cloneDir || '').trim();
    if (configured && window.services.pathExists(configured)) {
      return configured;
    }
    const picked = window.services.pickDirectory(configured || undefined);
    return picked || null;
  }

  function buildBanner(message, actions) {
    const actionHtml = (actions || [])
      .map((a, i) => `<a href="#" data-action-idx="${i}">${escapeHtml(a.label)}</a>`)
      .join('');
    return `<span class="banner-msg">${message}</span><span class="banner-actions">${actionHtml}</span>`;
  }

  function showBannerWithActions(message, level, actions) {
    showBanner(buildBanner(message, actions), level);
    (actions || []).forEach((a, i) => {
      const el = bannerEl.querySelector(`[data-action-idx="${i}"]`);
      if (el) {
        el.addEventListener('click', (ev) => {
          ev.preventDefault();
          try { a.onClick(); } catch (_) {}
        });
      }
    });
  }

  async function cloneCurrent() {
    if (cloning) {
      window.services.notify('已有克隆任务在进行中');
      return;
    }
    const p = currentItem();
    if (!p) return;
    const url = p.http_url_to_repo || p.ssh_url_to_repo;
    if (!url) {
      window.services.notify('该仓库没有可用的 clone 地址');
      return;
    }
    const targetDir = resolveCloneDir();
    if (!targetDir) return; // 用户取消选择

    const projectName = (p.path_with_namespace || p.name || '').split('/').pop() || p.name || 'repo';

    cloning = true;
    showBanner(`<span class="banner-msg">正在克隆 <b>${escapeHtml(projectName)}</b> 到 ${escapeHtml(targetDir)}…</span>`, 'info');

    try {
      const result = await window.services.cloneRepo({
        url,
        targetDir,
        projectName,
        onProgress: ({ line }) => {
          showBanner(`<span class="banner-msg">克隆 ${escapeHtml(projectName)}：${escapeHtml(line)}</span>`, 'info');
        },
      });
      showBannerWithActions(
        `✅ 克隆完成：${escapeHtml(result.dest)}`,
        'success',
        [
          { label: '在 Finder 中打开', onClick: () => window.services.showInFileManager(result.dest) },
          { label: '复制路径', onClick: () => { window.services.copy(result.dest); window.services.notify('已复制路径'); } },
          { label: '关闭', onClick: clearBanner },
        ]
      );
      window.services.notify(`克隆完成：${projectName}`);
    } catch (err) {
      if (err.kind === 'EXISTS') {
        showBannerWithActions(
          `❌ 目标路径已存在：${escapeHtml(err.dest)}`,
          'err',
          [
            { label: '在 Finder 中打开', onClick: () => window.services.showInFileManager(err.dest) },
            { label: '关闭', onClick: clearBanner },
          ]
        );
      } else if (err.kind === 'NO_GIT') {
        showBannerWithActions(
          '❌ 未找到 git 命令，请先安装 git',
          'err',
          [{ label: '关闭', onClick: clearBanner }]
        );
      } else {
        const msg = (err.message || String(err)).split('\n').pop();
        showBannerWithActions(
          `❌ 克隆失败：${escapeHtml(msg)}`,
          'err',
          [
            { label: '复制 clone 命令', onClick: () => { window.services.copy(`git clone ${url}`); window.services.notify('已复制 git clone 命令'); } },
            { label: '关闭', onClick: clearBanner },
          ]
        );
      }
    } finally {
      cloning = false;
    }
  }

  // --------- 事件绑定 ---------
  searchInput.addEventListener('input', debounce(doSearch, 120));

  searchInput.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!ready) return;
      if ((e.metaKey || e.ctrlKey) && e.shiftKey) cloneCurrent();
      else if (e.metaKey || e.ctrlKey) openProject('mr');
      else if (e.altKey) openProject('issues');
      else if (e.shiftKey) openProject('pipelines');
      else openProject('web');
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
      const hasSelection = searchInput.selectionStart !== searchInput.selectionEnd;
      if (!hasSelection) {
        e.preventDefault();
        copyToClipboard(e.shiftKey ? 'ssh' : 'https');
      }
      return;
    }
    if (e.key === 'Escape') {
      if (settingsView.style.display === 'block') {
        showView('search');
        return;
      }
      if (searchInput.value) {
        searchInput.value = '';
        doSearch();
      } else {
        window.services.outPlugin();
      }
    }
  });

  settingsBtn.addEventListener('click', () => showView('settings'));

  // 暴露 reload 给 settings（同步完成后刷新搜索索引）
  window.searchController = {
    reload() {
      if (searchView.style.display !== 'none') {
        init();
      } else {
        ready = false; // 下次切回搜索 view 时重新 init
      }
    },
  };

  // --------- 启动 ---------
  // 每次用户通过指令进入插件，都会触发 onPluginEnter
  if (window.utools && typeof window.utools.onPluginEnter === 'function') {
    window.utools.onPluginEnter(({ code, payload }) => {
      if (code === 'gitlab-settings') {
        showView('settings');
      } else {
        showView('search');
        if (typeof payload === 'string' && payload.trim()) {
          searchInput.value = payload;
          doSearch();
        }
      }
    });
  } else {
    // 非 uTools 环境（浏览器直接打开调试）兜底
    showView('search');
  }
})();
