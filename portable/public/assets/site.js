const app = document.querySelector('#app');
const lightbox = document.querySelector('#lightbox');
const viewer = document.querySelector('#lightbox-photo');
const count = document.querySelector('#lightbox-count');
let works = [], categories = [], activeFilter = 'all';
let gallery = [], photoIndex = 0;

const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const source = value => {
  const s = String(value || '');
  return /^\/(?:images|uploads)\/[a-zA-Z0-9_.-]+$/.test(s) ? s : '';
};
const byPosition = (a,b) => a.position - b.position;

async function load() {
  try {
    const [a, b] = await Promise.all([fetch('/api/works'), fetch('/api/categories')]);
    if (!a.ok || !b.ok) throw new Error('无法读取作品数据');
    works = (await a.json()).sort(byPosition);
    categories = await b.json();
    render();
  } catch (err) {
    app.innerHTML = '<div class="state-note"><h2>作品暂时无法载入</h2><p>请确认恩万婚礼服务已启动。</p></div>';
  }
}
function styleName(id) { return categories.find(item => item.id === id)?.name || ''; }
function card(work) {
  return '<a class="work-card" href="#work/' + encodeURIComponent(work.id) + '">' +
    '<img loading="lazy" decoding="async" src="' + source(work.cover) + '" alt="' + escape(work.title) + '">' +
    '<h3>' + escape(work.title) + '</h3><p>' +
    escape(work.subtitle || styleName(work.category)) + '</p></a>';
}
function filterBar() {
  const filters = [{ id:'all', name:'全部作品' }, ...categories];
  return '<div class="filter-bar" role="group" aria-label="筛选婚礼风格">' +
    filters.map(item => '<button type="button" data-filter="' + item.id + '" class="' +
      (activeFilter === item.id ? 'active' : '') + '">' + escape(item.name) + '</button>').join('') + '</div>';
}
function grid() {
  const list = works.filter(w => activeFilter === 'all' || w.category === activeFilter);
  if (!list.length) return '<p class="state-note">此风格尚未发布婚礼作品。</p>';
  return '<div class="work-grid">' + list.map(card).join('') + '</div>';
}
function home() {
  const featured = works.find(w => w.category === 'korean') || works[0];
  const hero = featured ?
    '<section class="hero"><div class="hero-frame"><img src="' + source(featured.cover) +
    '" alt="' + escape(featured.title) + ' 婚礼场景"><div class="hero-copy">' +
    '<p class="overline">ENWAN WEDDING COLLECTION</p><h1>' + escape(featured.title) +
    '</h1><a href="#work/' + encodeURIComponent(featured.id) + '">探索这场婚礼 →</a></div>' +
    '<span class="hero-count">01 / ' + works.length + '</span></div></section>' : '';
  return hero + '<section class="section-wrap"><div class="section-heading"><div>' +
    '<p class="overline">THE COLLECTION</p><h2>婚礼作品</h2><p>不同风格、不同区域，记录每一场婚礼的布置细节。</p></div>' +
    '<a href="#works" class="more-link">全部作品 →</a></div>' + filterBar() + grid() + '</section>';
}
function listing() {
  return '<section class="section-wrap"><div class="section-heading"><div>' +
    '<p class="overline">ENWAN WEDDING</p><h2>全部婚礼作品</h2><p>选择风格，浏览现场布置与细节。</p>' +
    '</div></div>' + filterBar() + grid() + '</section>';
}
function detail(work) {
  const images = [{ src: work.cover, alt: work.title }, ...work.details];
  const body = '<section class="section-wrap"><div class="detail-breadcrumb">' +
    '<a href="#works">婚礼作品</a> / ' + escape(styleName(work.category)) + '</div>' +
    '<img class="detail-feature" src="' + source(work.cover) + '" alt="' + escape(work.title) +
    '" data-photo="0" tabindex="0" role="button" aria-label="打开主封面大图">' +
    '<div class="detail-header"><div><p class="overline">' + escape(styleName(work.category)) + '</p>' +
    '<h1>' + escape(work.title) + '</h1><p>' + escape(work.description || work.subtitle || '') +
    '</p></div><span class="detail-count">' + images.length + ' PHOTOS</span></div>';
  if (!work.details.length) return body + '</section>';
  const photoGrid = work.details.map((item, index) =>
    '<button type="button" data-photo="' + (index + 1) + '" aria-label="查看第' + (index + 2) + '张婚礼照片">' +
    '<img loading="lazy" src="' + source(item.src) + '" alt="' + escape(item.alt || (work.title + '细节照片')) + '"></button>'
  ).join('');
  return body + '<div class="details-heading"><p class="overline">WEDDING DETAILS</p><h2>婚礼现场细节</h2></div>' +
    '<div class="photo-grid">' + photoGrid + '</div></section>';
}
function render() {
  const hash = decodeURIComponent(location.hash.replace(/^#/, '') || 'home');
  const [section, id] = hash.split('/');
  const showingWork = section === 'work' && id;
  const work = showingWork ? works.find(w => w.id === id) : null;
  const path = showingWork && work ? 'work' : section === 'works' ? 'works' : 'home';
  document.querySelector('#nav-home').classList.toggle('active', path === 'home');
  document.querySelector('#nav-works').classList.toggle('active', path !== 'home');
  if (path === 'work') {
    gallery = [{ src:work.cover, alt:work.title }, ...work.details];
    app.innerHTML = detail(work);
  } else { gallery = []; app.innerHTML = path === 'works' ? listing() : home(); }
  window.scrollTo({ top:0, behavior:'instant' });
}
function openPhoto(index) {
  if (!gallery.length) return;
  photoIndex = (index + gallery.length) % gallery.length;
  const image = gallery[photoIndex];
  viewer.src = source(image.src);
  viewer.alt = image.alt || '婚礼细节图片';
  count.textContent = (photoIndex + 1) + ' / ' + gallery.length;
  document.querySelector('#lightbox-prev').hidden = gallery.length < 2;
  document.querySelector('#lightbox-next').hidden = gallery.length < 2;
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closePhoto() {
  lightbox.hidden = true;
  document.body.style.overflow = '';
  viewer.removeAttribute('src');
}
app.addEventListener('click', event => {
  const filter = event.target.closest('[data-filter]');
  if (filter) { activeFilter = filter.dataset.filter; render(); return; }
  const image = event.target.closest('[data-photo]');
  if (image) openPhoto(Number(image.dataset.photo));
});
app.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-photo]')) {
    event.preventDefault();
    openPhoto(Number(event.target.dataset.photo));
  }
});
document.querySelector('#lightbox-close').addEventListener('click', closePhoto);
document.querySelector('#lightbox-prev').addEventListener('click', () => openPhoto(photoIndex - 1));
document.querySelector('#lightbox-next').addEventListener('click', () => openPhoto(photoIndex + 1));
lightbox.addEventListener('click', event => { if (event.target === lightbox) closePhoto(); });
document.addEventListener('keydown', event => {
  if (lightbox.hidden) return;
  if (event.key === 'Escape') closePhoto();
  if (event.key === 'ArrowLeft') openPhoto(photoIndex - 1);
  if (event.key === 'ArrowRight') openPhoto(photoIndex + 1);
});
window.addEventListener('hashchange', render);
load();
