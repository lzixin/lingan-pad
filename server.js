#!/usr/bin/env node
// 灵感停机坪：零依赖的本地小服务。
// 只监听本机，给浏览器提供页面，并通过 /api/ideas 读写 ideas.md。
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = __dirname;
const PAGE = path.join(ROOT, 'public', 'index.html');
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const has = name => args.includes(name);
const expandHome = p => (p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p);

if (has('-h') || has('--help')) {
  console.log(`灵感停机坪

用法：npm start [-- 参数]   或   node server.js [参数]

  --port 4321        端口（默认 4321，也可以用环境变量 PORT）
  --file <路径>      想法存到哪个 md（默认是本目录的 ideas.md，也可以用环境变量 IDEAS_FILE）
  --no-open          启动后不自动打开浏览器
`);
  process.exit(0);
}

const PORT = Number(flag('--port') || process.env.PORT || 4321);
const FILE = path.resolve(expandHome(flag('--file') || process.env.IDEAS_FILE || path.join(ROOT, 'ideas.md')));
const OPEN = !has('--no-open');
const URL_ = `http://localhost:${PORT}`;
const MAX_BODY = 5 * 1024 * 1024;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`端口不对：${flag('--port') || process.env.PORT}`);
  process.exit(1);
}

/* ---------- ideas.md 读写 ---------- */
const hash = s => crypto.createHash('sha1').update(s, 'utf8').digest('hex');

function readIdeas() {
  try { return fs.readFileSync(FILE, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return ''; throw e; }
}

// 先写临时文件再改名，写到一半断电也不会留下半个文件。
// 如果 ideas.md 是个软链接，就写到它指向的真实文件，不破坏链接。
function writeIdeas(text) {
  let target = FILE;
  try { target = fs.realpathSync(FILE); } catch {}
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, text, 'utf8');
  try {
    fs.renameSync(tmp, target);
  } catch (e) {
    // Windows 上文件被别的程序占用时改名会失败，退回直接覆盖
    fs.writeFileSync(target, text, 'utf8');
    try { fs.unlinkSync(tmp); } catch {}
  }
}

/* ---------- HTTP ---------- */
const allowedHosts = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]);
const allowedOrigins = new Set([...allowedHosts].map(h => `http://${h}`));

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
const sendJson = (res, status, obj, headers = {}) =>
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', ...headers });

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('内容太大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handle(req, res) {
  // 只接受发给本机地址的请求，挡掉别的网站借道访问
  if (!allowedHosts.has(req.headers.host)) return send(res, 403, 'forbidden');
  const { pathname } = new URL(req.url, URL_);

  if (pathname === '/' || pathname === '/index.html') {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    return send(res, 200, fs.readFileSync(PAGE), { 'Content-Type': 'text/html; charset=utf-8' });
  }

  if (pathname === '/api/ping') return sendJson(res, 200, { app: 'lingan-pad', file: FILE });

  if (pathname === '/api/ideas') {
    if (req.method === 'GET') {
      const text = readIdeas();
      const h = hash(text);
      if (req.headers['if-none-match'] === h) return send(res, 304, '', { ETag: h });
      return sendJson(res, 200, { text, hash: h, path: FILE }, { ETag: h });
    }
    if (req.method === 'PUT') {
      const origin = req.headers.origin;
      if (origin && !allowedOrigins.has(origin)) return send(res, 403, 'forbidden');
      if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return send(res, 415, 'need json');
      let body;
      try { body = JSON.parse(await readBody(req)); } catch (e) { return sendJson(res, 400, { error: e.message }); }
      if (!body || typeof body.text !== 'string') return sendJson(res, 400, { error: 'text 必须是字符串' });
      const current = readIdeas();
      // 页面上次看到的版本和文件现在不一样（比如 agent 刚改过）：退回去让页面先合并
      if (body.ifMatch && body.ifMatch !== hash(current)) return sendJson(res, 409, { text: current, hash: hash(current) });
      if (body.text !== current) writeIdeas(body.text);
      return sendJson(res, 200, { hash: hash(body.text) });
    }
    return send(res, 405, 'method not allowed');
  }

  send(res, 404, 'not found');
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(e => {
    console.error('出错了：', e.message);
    if (!res.headersSent) sendJson(res, 500, { error: e.message });
    else res.end();
  });
});

/* ---------- 打开浏览器（优先 Chrome） ---------- */
function openBrowser(url) {
  const tries =
    process.platform === 'darwin' ? [['open', ['-a', 'Google Chrome', url]], ['open', [url]]] :
    process.platform === 'win32' ? [['cmd', ['/c', 'start', '""', url]]] :
    [['google-chrome', [url]], ['xdg-open', [url]]];
  const attempt = i => {
    if (i >= tries.length) { console.log(`  没能自动打开浏览器，请手动打开：${url}`); return; }
    const [cmd, cmdArgs] = tries[i];
    let failed = false;
    const fail = () => { if (!failed) { failed = true; attempt(i + 1); } };
    try {
      const p = spawn(cmd, cmdArgs, { stdio: 'ignore', detached: process.platform !== 'win32', windowsVerbatimArguments: process.platform === 'win32' });
      p.on('error', fail);
      p.on('exit', code => { if (code) fail(); });
      p.unref();
    } catch { fail(); }
  };
  attempt(0);
}

/* ---------- 启动 ---------- */
function alreadyRunning(cb) {
  const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/ping', headers: { host: `localhost:${PORT}` }, timeout: 1500 }, r => {
    let b = '';
    r.on('data', c => { b += c; });
    r.on('end', () => { try { cb(JSON.parse(b)); } catch { cb(null); } });
  });
  req.on('timeout', () => req.destroy());
  req.on('error', () => cb(null));
}

server.on('error', e => {
  if (e.code !== 'EADDRINUSE') { console.error(e); process.exit(1); }
  alreadyRunning(info => {
    if (info && info.app === 'lingan-pad') {
      console.log(`灵感停机坪已经在运行了：${URL_}`);
      console.log(`  想法存在：${info.file}`);
      if (OPEN) openBrowser(URL_);
      setTimeout(() => process.exit(0), 300);
    } else {
      console.error(`端口 ${PORT} 被别的程序占用了。换一个试试：npm start -- --port ${PORT + 1}`);
      process.exit(1);
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log(`  灵感停机坪已启动：${URL_}`);
  console.log(`  想法存在：${FILE}`);
  console.log('  关闭：在这个窗口按 Ctrl+C');
  console.log('');
  if (OPEN) openBrowser(URL_);
});

const stop = () => { console.log('\n  已关闭，想法都在 ideas.md 里。'); server.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
