import { createServer } from 'node:http';
import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, 'public');
const DATA = resolve(process.env.DATA_DIR || join(ROOT, 'data'));
const STORE = join(DATA, 'works.json');
const UPLOAD = join(DATA, 'uploads');
const INQUIRY_STORE = join(DATA, 'inquiries.json');
const WECOM_WEBHOOK = (process.env.WECOM_WEBHOOK || '').trim();
const CONTACT = {
  phone: process.env.CONTACT_PHONE?.trim() || '待配置',
  wechat: process.env.CONTACT_WECHAT?.trim() || '待配置',
  address: process.env.CONTACT_ADDRESS?.trim() || '待配置'
};
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const SECRET = process.env.COOKIE_SECRET || '';
const SECURE = process.env.COOKIE_SECURE === '1';
const CATEGORIES = [
  ['traditional_chinese', '传统中式'], ['coffee_drapery', '布幔｜咖色系'],
  ['pink_drapery', '布幔｜粉色系'], ['new_chinese', '新中式'],
  ['forest', '森系'], ['european', '欧式'],
  ['french_garden', '法式花园'], ['old_money', '老钱风'],
  ['korean', '韩式']
];
const categoryIds = new Set(CATEGORIES.map(x => x[0]));
const samples = CATEGORIES.map(([category, title], index) => ({
  id: category, category, title, subtitle: '', description: '',
  cover: '/images/' + category + '.jpg', details: [], published: true,
  position: index, createdAt: new Date().toISOString()
}));
let works = [];
let writes = Promise.resolve();
let inquiries = [];
let inquiryWrites = Promise.resolve();
const inquiryAttempts = new Map();
const inquiryBusy = new Set();
const sessions = new Map();
const failures = new Map();

if (PASSWORD.startsWith('REPLACE_WITH') || SECRET.startsWith('REPLACE_WITH') || PASSWORD.length < 12 || SECRET.length < 32) {
  console.error('Please set ADMIN_PASSWORD (12+ chars) and COOKIE_SECRET (32+ chars) in .env.');
  process.exit(1);
}
if (DATA === PUBLIC || DATA.startsWith(PUBLIC + sep)) {
  console.error('DATA_DIR must not be located inside public.');
  process.exit(1);
}
const passDigest = scryptSync(PASSWORD, 'enwan-admin-v1', 32);

async function initialize() {
  await mkdir(UPLOAD, { recursive: true });
  if (existsSync(STORE)) {
    const parsed = JSON.parse(await readFile(STORE, 'utf8'));
    if (!Array.isArray(parsed.works)) throw new Error('Invalid works.json');
    works = parsed.works;
  } else {
    works = samples;
    await persist(works);
  }
  if (existsSync(INQUIRY_STORE)) {
    const parsed = JSON.parse(await readFile(INQUIRY_STORE, 'utf8'));
    if (!Array.isArray(parsed.inquiries)) throw new Error('Invalid inquiries.json');
    inquiries = parsed.inquiries;
  } else await persistInquiries(inquiries);
}
async function persist(next) {
  const temporary = STORE + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, JSON.stringify({ version: 1, works: next }, null, 2), { mode: 0o600 });
  await rename(temporary, STORE);
}
function mutate(transform) {
  const task = writes.then(async () => {
    const next = structuredClone(works);
    const result = await transform(next);
    await persist(next);
    works = next;
    return result;
  });
  writes = task.catch(() => {});
  return task;
}
async function persistInquiries(next) {
  const temp = INQUIRY_STORE + '.' + randomUUID() + '.tmp';
  await writeFile(temp, JSON.stringify({version:1,inquiries:next}, null, 2), {mode:0o600});
  await rename(temp, INQUIRY_STORE);
}
function mutateInquiries(transform) {
  const job = inquiryWrites.then(async () => {
    const next = structuredClone(inquiries);
    const result = transform(next);
    await persistInquiries(next);
    inquiries = next;
    return result;
  });
  inquiryWrites = job.catch(() => {});
  return job;
}
function validInquiry(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw error(400, '咨询信息格式有误');
  const name = text(data.name, 60);
  const phone = text(data.phone, 30);
  const date = text(data.date, 10);
  const place = text(data.place, 120);
  const category = text(data.category, 80);
  const notes = text(data.notes, 800);
  if (!name || !phone) throw error(400, '请填写称呼和联系电话');
  if (!/^[+0-9()\-\s]{7,24}$/.test(phone)) throw error(400, '联系电话格式不正确');
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date + 'T00:00:00Z').getTime()) ||
      new Date(date + 'T00:00:00Z').toISOString().slice(0,10) !== date)) throw error(400, '婚礼日期格式不正确');
  if (category && !categoryIds.has(category)) throw error(400, '请选择有效婚礼风格');
  return {name,phone,date,place,category,notes};
}
function inquiryMessage(item) {
  const cat = CATEGORIES.find(x => x[0] === item.category)?.[1] || '未填写';
  return ['【婚礼咨询】','称呼：'+item.name,'电话：'+item.phone,
    '婚礼日期：'+(item.date||'未填写'),'地点：'+(item.place||'未填写'),
    '喜欢的作品：'+cat,'其他需求：'+(item.notes||'未填写'),
    '编号：'+item.id].join('\n');
}
async function deliverInquiry(id) {
  if (!WECOM_WEBHOOK || inquiryBusy.has(id)) return;
  if (!/^https:\/\/qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?key=[\w-]+$/.test(WECOM_WEBHOOK)) {
    console.error('Invalid WECOM_WEBHOOK configuration (expected official enterprise WeChat robot URL)');
    return;
  }
  const item = inquiries.find(x=>x.id===id);
  if (!item || item.status==='sent') return;
  inquiryBusy.add(id);
  let sent=false;
  try {
    const response=await fetch(WECOM_WEBHOOK,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({msgtype:'text',text:{content:inquiryMessage(item)}}),
      signal:AbortSignal.timeout(6500)
    });
    if (!response.ok) throw Error('HTTP '+response.status);
    const result=await response.json();
    if (result.errcode!==0) throw Error('WeCom response code '+String(result.errcode));
    sent=true;
  } catch(err) {
    console.error('WeCom notification failed for inquiry', id, String(err?.message||'unknown'));
  } finally {
    await mutateInquiries(next=>{
      const row=next.find(x=>x.id===id);
      if(row){row.attempts=(row.attempts||0)+1;row.status=sent?'sent':'pending';row.lastAttemptAt=new Date().toISOString();}
    }).catch(err=>console.error('Failed to update inquiry delivery status',String(err?.message||err)));
    inquiryBusy.delete(id);
  }
}
function headers(res, status, type, extra = {}) {
  res.writeHead(status, {
    'Content-Type': type, 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    ...extra
  });
}
function send(res, status, value, extra = {}) {
  const body = JSON.stringify(value);
  headers(res, status, 'application/json; charset=utf-8', extra);
  res.end(body);
}
function error(status, message) { const e = new Error(message); e.status = status; return e; }
async function bodyBuffer(req, limit) {
  const parts = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw error(413, '文件或请求内容过大');
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}
async function jsonBody(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw error(415, '需要 JSON 请求');
  const raw = await bodyBuffer(req, 1024 * 1024);
  try { return JSON.parse(raw.toString('utf8')); } catch { throw error(400, 'JSON 格式错误'); }
}
function sign(value) { return createHmac('sha256', SECRET).update(value).digest('base64url'); }
function sessionCookie(token, maxAge) {
  return 'enwan_session=' + token + '; Path=/; HttpOnly; SameSite=Strict' +
    (SECURE ? '; Secure' : '') + '; Max-Age=' + maxAge;
}
function getSession(req) {
  const match = (req.headers.cookie || '').match(/(?:^|;\s*)enwan_session=([^;]+)/);
  if (!match) return '';
  const token = match[1];
  const parts = token.split('.');
  if (parts.length !== 2) return '';
  const [id, mac] = parts;
  const expected = sign(id);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return '';
  const expires = sessions.get(id);
  if (!expires || expires < Date.now()) { sessions.delete(id); return ''; }
  return id;
}
function requireAdmin(req) {
  if (!getSession(req)) throw error(401, '请先登录管理后台');
}
function guardChange(req) {
  const origin = req.headers.origin;
  if (origin) {
    const expected = (SECURE ? 'https://' : 'http://') + req.headers.host;
    if (origin !== expected) throw error(403, '请求来源不受信任');
  }
  if (req.headers['x-enwan-action'] !== '1') throw error(403, '缺少操作验证标记');
}
function text(value, max) { return String(value ?? '').trim().slice(0, max); }
function checkFields(payload, existing = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw error(400, '作品信息格式错误');
  const category = payload.category === undefined ? existing.category : text(payload.category, 80);
  if (!categoryIds.has(category)) throw error(400, '请选择有效婚礼风格');
  const title = payload.title === undefined ? existing.title : text(payload.title, 100);
  if (!title) throw error(400, '请填写作品名称');
  return {
    category, title,
    subtitle: payload.subtitle === undefined ? (existing.subtitle || '') : text(payload.subtitle, 120),
    description: payload.description === undefined ? (existing.description || '') : text(payload.description, 1000),
    published: typeof payload.published === 'boolean' ? payload.published : Boolean(existing.published),
    position: typeof payload.position === 'number' && Number.isFinite(payload.position)
      ? Math.max(0, Math.min(Math.round(payload.position), 100000)) : (existing.position || 0)
  };
}
function findWork(id) { const w = works.find(w => w.id === id); if (!w) throw error(404, '作品不存在'); return w; }
function sniff(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ['.jpg', 'image/jpeg'];
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return ['.png', 'image/png'];
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return ['.webp', 'image/webp'];
  throw error(415, '仅支持 JPG、PNG、WebP 图片');
}
async function removeUploaded(src) {
  if (!src || !/^\/uploads\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(src)) return;
  await unlink(join(UPLOAD, src.slice('/uploads/'.length))).catch(() => {});
}
async function staticFile(req, res, path, isUpload = false) {
  const base = isUpload ? UPLOAD : PUBLIC;
  const relative = path.replace(/^\/+/, '');
  const file = resolve(base, relative);
  if (!file.startsWith(base + sep)) throw error(403, '禁止访问此路径');
  let st;
  try { st = statSync(file); } catch { throw error(404, '文件不存在'); }
  if (!st.isFile()) throw error(404, '文件不存在');
  const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
    '.js':'text/javascript; charset=utf-8', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
    '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.ico':'image/x-icon' };
  const mime = types[extname(file).toLowerCase()];
  if (!mime) throw error(404, '文件类型未开放');
  headers(res, 200, mime, { 'Content-Length': String(st.size),
    'Cache-Control': mime.startsWith('image/') ? 'public, max-age=3600' : 'no-cache' });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
}
async function handle(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const p = url.pathname === '/wedding' ? '/' : url.pathname.startsWith('/wedding/') ? url.pathname.slice('/wedding'.length) : url.pathname;
  const method = req.method;
  const api = p.startsWith('/api/');
  if (api && !['GET','POST','PATCH','DELETE'].includes(method)) throw error(405, '不支持的请求方式');
  if (api && method !== 'GET') guardChange(req);
  if (p === '/api/site-config' && method === 'GET') return send(res,200,{contacts:CONTACT});
  if (p === '/api/inquiry' && method === 'POST') {
    const ip=(req.socket.remoteAddress||'unknown').slice(0,100);
    const rate=inquiryAttempts.get(ip)||[];
    const recent=rate.filter(t=>t>Date.now()-60*60*1000);
    if (recent.length>=6) throw error(429,'提交次数较多，请稍后再试');
    const data=await jsonBody(req);
    if (data.website) return send(res,202,{accepted:true});
    const values=validInquiry(data);
    const row={id:randomUUID(),...values,createdAt:new Date().toISOString(),status:'pending',attempts:0};
    await mutateInquiries(next=>{next.push(row)});
    inquiryAttempts.set(ip,[...recent,Date.now()]);
    void deliverInquiry(row.id);
    return send(res,202,{accepted:true});
  }
  if (p === '/api/health' && method === 'GET') return send(res, 200, { ok: true, app: 'enwan-wedding' });
  if (p === '/api/categories' && method === 'GET') return send(res, 200, CATEGORIES.map(([id, name]) => ({ id, name })));
  if (p === '/api/works' && method === 'GET') {
    return send(res, 200, works.filter(w => w.published && w.cover)
      .sort((a,b) => a.position - b.position).map(w => ({ ...w })));
  }
  if (p === '/api/admin/login' && method === 'POST') {
    const ip = (req.socket.remoteAddress || '').slice(0, 80);
    const entry = failures.get(ip) || { count: 0, expires: 0 };
    if (entry.expires > Date.now() && entry.count >= 8) throw error(429, '尝试次数过多，请稍后再试');
    const data = await jsonBody(req);
    const candidate = scryptSync(text(data.password, 512), 'enwan-admin-v1', 32);
    if (!timingSafeEqual(passDigest, candidate)) {
      failures.set(ip, { count: entry.expires > Date.now() ? entry.count + 1 : 1, expires: Date.now() + 15 * 60 * 1000 });
      throw error(401, '登录密码错误');
    }
    failures.delete(ip);
    const id = randomUUID();
    sessions.set(id, Date.now() + 12 * 60 * 60 * 1000);
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(id + '.' + sign(id), 43200) });
  }
  if (p === '/api/admin/logout' && method === 'POST') {
    const id = getSession(req);
    if (id) sessions.delete(id);
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  }
  if (p.startsWith('/api/admin/')) requireAdmin(req);
  if (p === '/api/admin/inquiries' && method === 'GET') return send(res,200,inquiries);
  if (p === '/api/admin/me' && method === 'GET') return send(res, 200, { authenticated: true });
  if (p === '/api/admin/works' && method === 'GET') return send(res, 200, [...works].sort((a,b) => a.position - b.position));
  if (p === '/api/admin/export' && method === 'GET') return send(res, 200, { version: 1, works });
  if (p === '/api/admin/works' && method === 'POST') {
    const data = await jsonBody(req);
    const fields = checkFields({ ...data, published: false }, { position: works.length });
    const created = { id: randomUUID(), ...fields, cover: '', details: [], published: false, createdAt: new Date().toISOString() };
    await mutate(next => { next.push(created); });
    return send(res, 201, created);
  }
  const workRoute = p.match(/^\/api\/admin\/works\/([a-z0-9_-]+)$/);
  if (workRoute && method === 'PATCH') {
    const id = workRoute[1]; findWork(id);
    const data = await jsonBody(req);
    const result = await mutate(next => {
      const row = next.find(w => w.id === id);
      Object.assign(row, checkFields(data, row));
      if (row.published && !row.cover) throw error(400, '发布前请先上传封面');
      return row;
    });
    return send(res, 200, result);
  }
  if (workRoute && method === 'DELETE') {
    const id = workRoute[1]; const old = findWork(id);
    await mutate(next => { next.splice(next.findIndex(w => w.id === id), 1); });
    await Promise.all([old.cover, ...old.details.map(d => d.src)].map(removeUploaded));
    return send(res, 200, { ok: true });
  }
  const uploadRoute = p.match(/^\/api\/admin\/works\/([a-z0-9_-]+)\/images$/);
  if (uploadRoute && method === 'POST') {
    const id = uploadRoute[1]; findWork(id);
    const role = url.searchParams.get('role');
    if (!['cover','detail'].includes(role)) throw error(400, '无效图片层级');
    const content = await bodyBuffer(req, 12 * 1024 * 1024);
    if (content.length < 50) throw error(400, '图片为空或格式不完整');
    const [ext] = sniff(content);
    const filename = randomUUID() + ext;
    const src = '/uploads/' + filename;
    await writeFile(join(UPLOAD, filename), content, { flag: 'wx', mode: 0o600 });
    let former = '';
    try {
      await mutate(next => {
        const row = next.find(w => w.id === id);
        if (!row) throw error(404, '作品不存在');
        if (role === 'cover') { former = row.cover; row.cover = src; }
        else row.details.push({ id: randomUUID(), src, alt: row.title + ' 细节' });
      });
    } catch (e) { await removeUploaded(src); throw e; }
    if (role === 'cover') await removeUploaded(former);
    return send(res, 201, { ok: true, src });
  }
  const reorder = p.match(/^\/api\/admin\/works\/([a-z0-9_-]+)\/details-order$/);
  if (reorder && method === 'PATCH') {
    const data = await jsonBody(req);
    if (!Array.isArray(data.ids)) throw error(400, '排序数据无效');
    await mutate(next => {
      const row = next.find(w => w.id === reorder[1]);
      if (!row) throw error(404, '作品不存在');
      const previous = row.details.map(d => d.id);
      if (previous.length !== data.ids.length || new Set(data.ids).size !== previous.length ||
          !data.ids.every(id => previous.includes(id))) throw error(400, '排序必须包含全部细节图');
      row.details.sort((a,b) => data.ids.indexOf(a.id) - data.ids.indexOf(b.id));
    });
    return send(res, 200, { ok: true });
  }
  const deleteDetail = p.match(/^\/api\/admin\/works\/([a-z0-9_-]+)\/images\/([a-z0-9-]+)$/);
  if (deleteDetail && method === 'DELETE') {
    const id = deleteDetail[1], imageId = deleteDetail[2]; let removed;
    await mutate(next => {
      const row = next.find(w => w.id === id);
      if (!row) throw error(404, '作品不存在');
      const index = row.details.findIndex(i => i.id === imageId);
      if (index < 0) throw error(404, '细节图不存在');
      removed = row.details.splice(index, 1)[0].src;
    });
    await removeUploaded(removed);
    return send(res, 200, { ok: true });
  }
  if (api) throw error(404, '接口不存在');
  if (!['GET', 'HEAD'].includes(method)) throw error(405, '不支持的请求方式');
  if (p === '/' || p === '/index.html') return staticFile(req, res, 'index.html');
  if (p === '/admin' || p === '/admin/') return staticFile(req, res, 'admin.html');
  if (p.startsWith('/uploads/')) return staticFile(req, res, p.slice('/uploads/'.length), true);
  const decoded = decodeURIComponent(p);
  return staticFile(req, res, decoded);
}

await initialize();
const server = createServer((req, res) => {
  handle(req, res).catch(e => {
    if (res.headersSent) { res.destroy(); return; }
    const status = e.status || 500;
    if (status === 500) console.error(e);
    send(res, status, { error: status === 500 ? '服务端错误' : e.message });
  });
});
const retryTimer=setInterval(()=>{
  const now=Date.now();
  for(const item of inquiries){
    if(item.status==='sent' || (item.attempts||0)>=12) continue;
    const last=item.lastAttemptAt?Date.parse(item.lastAttemptAt):0;
    if(now-last<Math.min(60*60*1000,60*1000*Math.pow(2,Math.min(item.attempts||0,6)))) continue;
    void deliverInquiry(item.id);
  }
},60000);
retryTimer.unref();
server.listen(PORT, HOST, () => {
  const address = server.address();
  console.log('ENWAN listening on http://' + HOST + ':' + address.port);
});
