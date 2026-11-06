const $ = sel => document.querySelector(sel);
const escape = value => String(value ?? '').replace(/[&<>"']/g,
  c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const safeSrc = value => /^\/(?:images|uploads)\/[\w.-]+$/.test(String(value || '')) ? String(value).slice(1) : '';
let works = [], categories = [], selectedId = '', filterId = 'all', busy = false, draggedId = '';
const login = $('#login-screen');
const dashboard = $('#dashboard');

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.method && options.method !== 'GET') headers['X-Enwan-Action'] = '1';
  const response = await fetch(path, { credentials:'same-origin', ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== 'api/admin/login') showLogin();
    throw new Error(payload.error || '网络请求失败');
  }
  return payload;
}
async function json(path, method, data) {
  return api(path, { method, headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(data) });
}
function notify(message, problem = false) {
  const element = $('#toast');
  element.textContent = message;
  element.style.background = problem ? '#a83f38' : '#24211e';
  element.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { element.hidden = true; }, 3200);
}
function showLogin(message = '') {
  dashboard.hidden = true;
  login.hidden = false;
  $('#login-message').textContent = message;
}
function showDashboard() {
  login.hidden = true;
  dashboard.hidden = false;
}
async function bootstrap() {
  try {
    categories = await api('api/categories');
    fillCategories();
    await api('api/admin/me');
    showDashboard();
    await refresh();
  } catch (error) { showLogin(); }
}
function fillCategories() {
  const choices = categories.map(c =>
    '<option value="' + escape(c.id) + '">' + escape(c.name) + '</option>').join('');
  $('#work-category').innerHTML = choices;
  $('#category-filter').innerHTML = '<option value="all">全部风格</option>' + choices;
}
function label(id) { return categories.find(c => c.id === id)?.name || id; }
function chosen() { return works.find(w => w.id === selectedId); }
async function refresh(prefer = selectedId) {
  works = await api('api/admin/works');
  selectedId = works.some(w => w.id === prefer) ? prefer : (works[0]?.id || '');
  renderList();
  renderEditor();
}
function renderList() {
  const visible = works.filter(w => filterId === 'all' || w.category === filterId);
  $('#work-list').innerHTML = visible.length ? visible.map(w => {
    const photo = w.cover ? '<img src="' + safeSrc(w.cover) + '" alt="">' : '<span class="thumb-placeholder">＋</span>';
    return '<button type="button" class="work-item ' + (w.id === selectedId ? 'active' : '') +
      '" data-select="' + escape(w.id) + '">' + photo + '<span><h3>' + escape(w.title) +
      '</h3><p>' + escape(label(w.category)) + ' · ' + (w.published ? '已发布' : '草稿') +
      '</p></span></button>';
  }).join('') : '<p class="helper">当前分类没有作品。</p>';
}
function renderEditor() {
  const w = chosen();
  $('#editor').hidden = !w;
  $('#empty-state').hidden = Boolean(w);
  if (!w) return;
  $('#editor-heading').textContent = w.title;
  $('#work-title').value = w.title;
  $('#work-category').value = w.category;
  $('#work-subtitle').value = w.subtitle || '';
  $('#work-description').value = w.description || '';
  $('#work-position').value = w.position || 0;
  $('#work-published').checked = Boolean(w.published);
  const preview = $('#preview');
  preview.href = w.published ? './#work/' + encodeURIComponent(w.id) : './';
  preview.textContent = w.published ? '查看已发布作品' : '草稿尚未公开';
  preview.style.pointerEvents = w.published ? 'auto' : 'none';
  preview.style.opacity = w.published ? '1' : '.45';
  $('#cover-area').innerHTML = w.cover ?
    '<img src="' + safeSrc(w.cover) + '" alt="' + escape(w.title) + '主封面">' :
    '<div class="cover-placeholder">尚未上传主封面</div>';
  renderDetails(w);
}
function renderDetails(w) {
  $('#details-list').innerHTML = w.details.length ? w.details.map((d, i) =>
    '<div class="detail-admin-card" draggable="true" data-drag-id="' + escape(d.id) + '">' +
    '<img src="' + safeSrc(d.src) + '" alt="' + escape(d.alt || '婚礼细节') + '">' +
    '<div class="detail-admin-controls"><span>' + (i + 1) + '</span>' +
    '<div><button type="button" data-move="' + escape(d.id) + '" data-direction="-1" aria-label="前移"' + (i === 0 ? ' disabled' : '') + '>←</button>' +
    '<button type="button" data-move="' + escape(d.id) + '" data-direction="1" aria-label="后移"' + (i === w.details.length - 1 ? ' disabled' : '') + '>→</button>' +
    '<button type="button" class="remove" data-remove="' + escape(d.id) + '" aria-label="删除细节图">×</button></div></div></div>'
  ).join('') : '<div class="no-details">暂无细节照片。可以一次选择多张图片上传。</div>';
}
async function saveWork() {
  const w = chosen();
  if (!w || busy) return;
  const title = $('#work-title').value.trim();
  if (!title) { notify('请填写作品名称', true); $('#work-title').focus(); return; }
  const data = {
    title, category:$('#work-category').value,
    subtitle:$('#work-subtitle').value.trim(),
    description:$('#work-description').value.trim(),
    position:Number($('#work-position').value) || 0,
    published:$('#work-published').checked
  };
  busy = true;
  try { await json('api/admin/works/' + w.id, 'PATCH', data); await refresh(w.id); notify('作品已保存'); }
  catch (e) { notify(e.message, true); } finally { busy = false; }
}
async function createWork() {
  if (busy) return;
  const category = filterId === 'all' ? (categories[0]?.id) : filterId;
  busy = true;
  try {
    const row = await json('api/admin/works', 'POST', { title:'未命名婚礼作品', category });
    await refresh(row.id);
    notify('已创建草稿。请上传封面、填写信息后再发布。');
    $('#work-title').focus();
    $('#work-title').select();
  } catch (e) { notify(e.message, true); } finally { busy = false; }
}
async function upload(files, role) {
  const w = chosen();
  if (!w || busy) return;
  const list = Array.from(files || []);
  if (!list.length) return;
  if (role === 'cover') list.splice(1);
  const supported = ['image/jpeg','image/png','image/webp'];
  if (list.some(f => !supported.includes(f.type) || f.size > 12 * 1024 * 1024)) {
    notify('仅支持不超过 12 MB 的 JPG、PNG、WebP 图片', true);
    return;
  }
  busy = true;
  const status = $('#upload-status');
  let sent = 0;
  try {
    for (const f of list) {
      status.textContent = '正在上传 ' + (sent + 1) + ' / ' + list.length + ' · ' + f.name;
      await api('api/admin/works/' + w.id + '/images?role=' + role, {
        method:'POST', headers:{ 'Content-Type':f.type }, body:f
      });
      sent++;
    }
    await refresh(w.id);
    status.textContent = '已上传 ' + sent + ' 张照片';
    notify('图片上传成功');
  } catch (error) {
    status.textContent = '成功 ' + sent + ' 张，剩余上传失败';
    await refresh(w.id).catch(() => {});
    notify(error.message, true);
  } finally { busy = false; $('#cover-input').value = ''; $('#details-input').value = ''; }
}
async function orderDetails(ids) {
  const w = chosen();
  if (!w || busy) return;
  busy = true;
  try {
    await json('api/admin/works/' + w.id + '/details-order', 'PATCH', { ids });
    await refresh(w.id); notify('展示顺序已调整');
  } catch (e) { notify(e.message, true); } finally { busy = false; }
}
async function moveDetail(id, delta) {
  const w = chosen();
  if (!w) return;
  const ids = w.details.map(d => d.id);
  const a = ids.indexOf(id), b = a + delta;
  if (a < 0 || b < 0 || b >= ids.length) return;
  [ids[a], ids[b]] = [ids[b], ids[a]];
  await orderDetails(ids);
}
async function removeDetail(imageId) {
  const w = chosen();
  if (!w || busy || !confirm('确定永久删除这张细节图吗？')) return;
  busy = true;
  try {
    await api('api/admin/works/' + w.id + '/images/' + imageId, { method:'DELETE' });
    await refresh(w.id); notify('细节图片已删除');
  } catch (e) { notify(e.message, true); } finally { busy = false; }
}
async function deleteWork() {
  const w = chosen();
  if (!w || busy || !confirm('确认永久删除「' + w.title + '」及所有上传的图片？此操作无法撤销。')) return;
  busy = true;
  try {
    await api('api/admin/works/' + w.id, { method:'DELETE' });
    selectedId = '';
    await refresh();
    notify('作品已删除');
  } catch (e) { notify(e.message, true); } finally { busy = false; }
}
async function exportMetadata() {
  try {
    const data = await api('api/admin/export');
    const blob = new Blob([JSON.stringify(data,null,2)], { type:'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'enwan-works-' + new Date().toISOString().slice(0,10) + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    notify('作品元数据已导出。完整迁移还需备份 data/uploads 图片目录。');
  } catch (e) { notify(e.message, true); }
}
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const button = e.currentTarget.querySelector('button[type=submit]');
  button.disabled = true;
  try {
    await json('api/admin/login', 'POST', { password:$('#password').value });
    $('#password').value = '';
    await bootstrap();
  } catch (err) { $('#login-message').textContent = err.message; }
  finally { button.disabled = false; }
});
$('#work-list').addEventListener('click', e => {
  const el = e.target.closest('[data-select]');
  if (!el) return;
  selectedId = el.dataset.select;
  renderList(); renderEditor();
});
$('#category-filter').addEventListener('change', e => {
  filterId = e.target.value;
  const visible = works.filter(w => filterId === 'all' || w.category === filterId);
  if (!visible.some(w => w.id === selectedId)) selectedId = visible[0]?.id || '';
  renderList(); renderEditor();
});
$('#create').addEventListener('click', createWork);
$('#save').addEventListener('click', saveWork);
$('#delete-work').addEventListener('click', deleteWork);
$('#cover-input').addEventListener('change', e => upload(e.target.files, 'cover'));
$('#details-input').addEventListener('change', e => upload(e.target.files, 'detail'));
$('#details-list').addEventListener('click', e => {
  const remove = e.target.closest('[data-remove]');
  if (remove) return removeDetail(remove.dataset.remove);
  const move = e.target.closest('[data-move]');
  if (move) moveDetail(move.dataset.move, Number(move.dataset.direction));
});
$('#details-list').addEventListener('dragstart', e => {
  const card = e.target.closest('[data-drag-id]');
  if (!card) return;
  draggedId = card.dataset.dragId;
  e.dataTransfer.effectAllowed = 'move';
});
$('#details-list').addEventListener('dragover', e => { if (draggedId) e.preventDefault(); });
$('#details-list').addEventListener('drop', e => {
  e.preventDefault();
  const target = e.target.closest('[data-drag-id]');
  const w = chosen();
  if (!target || !w || !draggedId || target.dataset.dragId === draggedId) return;
  const ids = w.details.map(d => d.id);
  const from = ids.indexOf(draggedId), to = ids.indexOf(target.dataset.dragId);
  if (from < 0 || to < 0) return;
  ids.splice(from, 1); ids.splice(to, 0, draggedId);
  draggedId = '';
  orderDetails(ids);
});
$('#details-list').addEventListener('dragend', () => { draggedId = ''; });
for (const [selector, role] of [['#cover-area','cover'],['#details-list','detail']]) {
  const zone = $(selector);
  zone.addEventListener('dragover', e => { if (!draggedId) e.preventDefault(); });
  zone.addEventListener('drop', e => {
    if (draggedId) return;
    e.preventDefault();
    if (e.dataTransfer.files?.length) upload(e.dataTransfer.files, role);
  });
}
$('#export').addEventListener('click', exportMetadata);
$('#logout').addEventListener('click', async () => {
  try { await api('api/admin/logout', { method:'POST' }); }
  catch { /* session may already be gone */ }
  works = []; selectedId = ''; showLogin();
});
bootstrap();
