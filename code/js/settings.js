(function () {
  const $ = (id) => document.getElementById(id);
  const baseUrlInput = $('baseUrl');
  const tokenInput = $('token');
  const toggleTokenBtn = $('toggleTokenBtn');
  const testBtn = $('testBtn');
  const saveBtn = $('saveBtn');
  const cloneDirInput = $('cloneDir');
  const browseCloneDirBtn = $('browseCloneDirBtn');
  const saveCloneBtn = $('saveCloneBtn');
  const cloneConfigStatus = $('cloneConfigStatus');
  const syncBtn = $('syncBtn');
  const clearBtn = $('clearBtn');
  const openSearchBtn = $('openSearchBtn');
  const testStatus = $('testStatus');
  const syncStatus = $('syncStatus');
  const syncProgress = $('syncProgress');
  const progressFill = syncProgress.querySelector('.fill');
  const statCount = $('statCount');
  const statLastSync = $('statLastSync');

  function setStatus(el, msg, level) {
    el.textContent = msg || '';
    el.classList.remove('success', 'err');
    if (level) el.classList.add(level);
  }

  function loadConfig() {
    const config = window.services.db.get(DB_KEYS.CONFIG) || {};
    baseUrlInput.value = config.baseUrl || 'https://gitlab.com';
    tokenInput.value = config.token || '';
    cloneDirInput.value = config.cloneDir || '';
  }

  function refreshStats() {
    const projectsDoc = window.services.db.get(DB_KEYS.PROJECTS);
    const count = projectsDoc && projectsDoc.items ? projectsDoc.items.length : 0;
    statCount.textContent = count;
    const config = window.services.db.get(DB_KEYS.CONFIG) || {};
    statLastSync.textContent = config.lastSyncAt ? formatDateTime(config.lastSyncAt) : '从未';
  }

  function validate() {
    const baseUrl = baseUrlInput.value.trim();
    const token = tokenInput.value.trim();
    if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
      setStatus(testStatus, '请填写有效的 GitLab 地址（http/https 开头）', 'err');
      return null;
    }
    if (!token) {
      setStatus(testStatus, '请填写 Personal Access Token', 'err');
      return null;
    }
    return { baseUrl, token };
  }

  toggleTokenBtn.addEventListener('click', () => {
    const isPwd = tokenInput.type === 'password';
    tokenInput.type = isPwd ? 'text' : 'password';
    toggleTokenBtn.textContent = isPwd ? '隐藏' : '显示';
  });

  testBtn.addEventListener('click', async () => {
    const v = validate();
    if (!v) return;
    testBtn.disabled = true;
    setStatus(testStatus, '正在测试连接…');
    try {
      const user = await window.services.testConnection(v.baseUrl, v.token);
      setStatus(testStatus, `连接成功，欢迎 ${user.name || user.username}`, 'success');
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        setStatus(testStatus, 'Token 无效或权限不足，请检查 scope（read_api）', 'err');
      } else {
        setStatus(testStatus, `连接失败：${err.message || err}`, 'err');
      }
    } finally {
      testBtn.disabled = false;
    }
  });

  saveBtn.addEventListener('click', () => {
    const v = validate();
    if (!v) return;
    const existing = window.services.db.get(DB_KEYS.CONFIG) || {};
    window.services.db.put(DB_KEYS.CONFIG, {
      ...existing,
      baseUrl: v.baseUrl,
      token: v.token,
    });
    setStatus(testStatus, '配置已保存', 'success');
    refreshStats();
  });

  syncBtn.addEventListener('click', async () => {
    const v = validate();
    if (!v) return;
    syncBtn.disabled = true;
    testBtn.disabled = true;
    clearBtn.disabled = true;
    syncProgress.classList.add('active');
    progressFill.style.width = '6%';
    setStatus(syncStatus, '正在拉取项目列表…');
    try {
      const projects = await window.services.fetchProjects(v.baseUrl, v.token, ({ page, total }) => {
        setStatus(syncStatus, `已拉取 ${total} 个项目（第 ${page} 页）…`);
        const approx = Math.min(95, 10 + page * 8);
        progressFill.style.width = approx + '%';
      });
      window.services.db.put(DB_KEYS.PROJECTS, {
        items: projects,
        updatedAt: new Date().toISOString(),
      });
      const existing = window.services.db.get(DB_KEYS.CONFIG) || {};
      window.services.db.put(DB_KEYS.CONFIG, {
        ...existing,
        baseUrl: v.baseUrl,
        token: v.token,
        lastSyncAt: new Date().toISOString(),
      });
      progressFill.style.width = '100%';
      setStatus(syncStatus, `同步完成，共 ${projects.length} 个项目`, 'success');
      refreshStats();
      // 通知搜索 view 数据已更新
      if (window.searchController && window.searchController.reload) {
        window.searchController.reload();
      }
    } catch (err) {
      progressFill.style.width = '0%';
      if (err.status === 401 || err.status === 403) {
        setStatus(syncStatus, 'Token 无效或权限不足', 'err');
      } else {
        setStatus(syncStatus, `同步失败：${err.message || err}`, 'err');
      }
    } finally {
      setTimeout(() => syncProgress.classList.remove('active'), 800);
      syncBtn.disabled = false;
      testBtn.disabled = false;
      clearBtn.disabled = false;
    }
  });

  clearBtn.addEventListener('click', () => {
    if (!confirm('确定要清除本地缓存吗？项目列表和搜索历史将被删除（配置保留）。')) return;
    window.services.db.remove(DB_KEYS.PROJECTS);
    window.services.db.remove(DB_KEYS.HISTORY);
    const existing = window.services.db.get(DB_KEYS.CONFIG) || {};
    delete existing.lastSyncAt;
    window.services.db.put(DB_KEYS.CONFIG, existing);
    refreshStats();
    setStatus(syncStatus, '已清除本地缓存', 'success');
    if (window.searchController && window.searchController.reload) {
      window.searchController.reload();
    }
  });

  openSearchBtn.addEventListener('click', () => {
    if (window.router) window.router.showView('search');
  });

  browseCloneDirBtn.addEventListener('click', () => {
    const picked = window.services.pickDirectory(cloneDirInput.value.trim() || undefined);
    if (picked) {
      cloneDirInput.value = picked;
      setStatus(cloneConfigStatus, '已选择，记得点保存', '');
    }
  });

  saveCloneBtn.addEventListener('click', () => {
    const dir = cloneDirInput.value.trim();
    if (dir && !window.services.pathExists(dir)) {
      setStatus(cloneConfigStatus, `目录不存在：${dir}`, 'err');
      return;
    }
    const existing = window.services.db.get(DB_KEYS.CONFIG) || {};
    window.services.db.put(DB_KEYS.CONFIG, { ...existing, cloneDir: dir });
    setStatus(cloneConfigStatus, dir ? `已保存：${dir}` : '已保存（留空，每次弹出选择器）', 'success');
  });

  // 暴露给 main.js 的控制接口
  window.settingsController = {
    refresh() {
      loadConfig();
      refreshStats();
      setStatus(testStatus, '');
      setStatus(syncStatus, '');
      setStatus(cloneConfigStatus, '');
      setTimeout(() => tokenInput.focus(), 0);
    },
  };
})();
