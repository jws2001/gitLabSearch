const https = require('https');
const http = require('http');
const { URL } = require('url');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function request(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlStr);
    } catch (e) {
      reject(new Error('无效的 URL: ' + urlStr));
      return;
    }
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: options.timeout || 15000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode, headers: res.headers, body });
        });
      }
    );
    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy(new Error('请求超时'));
    });
    req.end();
  });
}

function normalizeBase(baseUrl) {
  return baseUrl.replace(/\/+$/, '');
}

async function testConnection(baseUrl, token) {
  const res = await request(`${normalizeBase(baseUrl)}/api/v4/user`, {
    headers: { 'PRIVATE-TOKEN': token, 'Accept': 'application/json' },
  });
  if (res.status === 200) {
    return JSON.parse(res.body);
  }
  const err = new Error(`连接失败：HTTP ${res.status}`);
  err.status = res.status;
  throw err;
}

async function fetchProjects(baseUrl, token, onProgress) {
  const perPage = 100;
  let page = 1;
  const all = [];
  let maxRetry = 1;
  while (true) {
    const url = `${normalizeBase(baseUrl)}/api/v4/projects?membership=true&per_page=${perPage}&page=${page}&order_by=last_activity_at&sort=desc`;
    const res = await request(url, {
      headers: { 'PRIVATE-TOKEN': token, 'Accept': 'application/json' },
    });
    if (res.status === 401 || res.status === 403) {
      const err = new Error('Token 无效或权限不足');
      err.status = res.status;
      throw err;
    }
    if (res.status === 429 && maxRetry > 0) {
      maxRetry--;
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (res.status !== 200) {
      throw new Error(`同步失败：HTTP ${res.status}`);
    }
    const items = JSON.parse(res.body);
    for (const p of items) {
      all.push({
        id: p.id,
        name: p.name,
        name_with_namespace: p.name_with_namespace,
        path_with_namespace: p.path_with_namespace,
        description: p.description || '',
        web_url: p.web_url,
        ssh_url_to_repo: p.ssh_url_to_repo,
        http_url_to_repo: p.http_url_to_repo,
        avatar_url: p.avatar_url || '',
        visibility: p.visibility,
        last_activity_at: p.last_activity_at,
        star_count: p.star_count || 0,
        namespace_full_path: (p.namespace && p.namespace.full_path) || '',
      });
    }
    if (onProgress) {
      try { onProgress({ page, total: all.length }); } catch (_) {}
    }
    const nextPage = res.headers['x-next-page'];
    if (!nextPage || items.length < perPage) break;
    page = parseInt(nextPage, 10);
    if (!page || page > 200) break;
  }
  return all;
}

function dbGet(key) {
  const doc = utools.db.get(key);
  return doc ? doc.data : null;
}

function dbPut(key, data) {
  const existing = utools.db.get(key);
  const doc = existing
    ? { _id: key, _rev: existing._rev, data }
    : { _id: key, data };
  let res = utools.db.put(doc);
  if (!res.ok) {
    const latest = utools.db.get(key);
    if (latest) {
      latest.data = data;
      res = utools.db.put(latest);
    }
  }
  if (!res.ok) throw new Error('写入本地数据库失败');
  return res;
}

function dbRemove(key) {
  const existing = utools.db.get(key);
  if (existing) utools.db.remove(existing);
}

function pathExists(p) {
  try { return !!p && fs.existsSync(p); } catch (_) { return false; }
}

function expandHome(p) {
  if (!p) return p;
  if (p === '~' || p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function pickDirectory(defaultPath) {
  const opts = {
    title: '选择克隆目标目录',
    properties: ['openDirectory', 'createDirectory'],
  };
  const hint = expandHome(defaultPath);
  if (hint && pathExists(hint)) opts.defaultPath = hint;
  try {
    const dirs = utools.showOpenDialog(opts);
    return dirs && dirs.length ? dirs[0] : null;
  } catch (err) {
    return null;
  }
}

function showInFileManager(p) {
  if (!p) return;
  if (typeof utools.shellShowItemInFolder === 'function') {
    utools.shellShowItemInFolder(p);
  } else if (typeof utools.shellOpenPath === 'function') {
    utools.shellOpenPath(p);
  }
}

/**
 * 执行 git clone。
 * @param {{ url: string, targetDir: string, projectName: string, onProgress?: (info)=>void }} opts
 * @returns {Promise<{ dest: string }>}
 */
function cloneRepo(opts) {
  return new Promise((resolve, reject) => {
    if (!opts || !opts.url || !opts.targetDir || !opts.projectName) {
      reject(new Error('参数不完整'));
      return;
    }
    const targetDir = expandHome(opts.targetDir);
    if (!pathExists(targetDir)) {
      reject(Object.assign(new Error(`目录不存在：${targetDir}`), { kind: 'NO_DIR' }));
      return;
    }
    const dest = path.join(targetDir, opts.projectName);
    if (fs.existsSync(dest)) {
      reject(Object.assign(new Error(`目标路径已存在：${dest}`), { kind: 'EXISTS', dest }));
      return;
    }
    const proc = spawn('git', ['clone', '--progress', opts.url, dest], {
      cwd: targetDir,
      env: {
        ...process.env,
        // 禁止 git 在终端弹出用户名/密码交互提示（会让子进程挂死）
        GIT_TERMINAL_PROMPT: '0',
      },
    });
    let stderrBuf = '';
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stderrBuf += text;
      // git clone --progress 把进度写到 stderr，用 \r 分片
      const lines = text.split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
      const last = lines[lines.length - 1];
      if (last && opts.onProgress) {
        try { opts.onProgress({ line: last }); } catch (_) {}
      }
    });
    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(Object.assign(new Error('未找到 git 命令，请先安装 git'), { kind: 'NO_GIT' }));
      } else {
        reject(err);
      }
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ dest });
      } else {
        const msg = stderrBuf.trim().split(/\n/).slice(-3).join('\n') || `git clone 退出码 ${code}`;
        const err = new Error(msg);
        err.kind = 'GIT_FAIL';
        err.code = code;
        err.stderr = stderrBuf;
        reject(err);
      }
    });
  });
}

function defaultCloneDir() {
  const guess = path.join(os.homedir(), 'Code');
  if (pathExists(guess)) return guess;
  return os.homedir();
}

window.services = {
  testConnection,
  fetchProjects,
  cloneRepo,
  pickDirectory,
  showInFileManager,
  pathExists,
  defaultCloneDir,
  db: {
    get: dbGet,
    put: dbPut,
    remove: dbRemove,
  },
  open: (url) => utools.shellOpenExternal(url),
  copy: (text) => {
    utools.copyText(text);
    return true;
  },
  notify: (msg) => utools.showNotification(msg),
  outPlugin: () => utools.outPlugin(),
};
