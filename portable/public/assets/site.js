const app = document.querySelector('#app');
const lightbox = document.querySelector('#lightbox');
const viewer = document.querySelector('#lightbox-photo');
const count = document.querySelector('#lightbox-count');
let works = [], categories = [], activeFilter = 'all';
let contacts = {phone:'待配置',wechat:'待配置',address:'待配置'};
const FAV_KEY='wedding_favs';
let favorites = [];
try { const parsed=JSON.parse(localStorage.getItem(FAV_KEY)||'[]'); if(Array.isArray(parsed)) favorites=parsed.filter(v=>typeof v==='string'); } catch {}
function isFav(id){return favorites.includes(id)}
function toggleFav(id){
  favorites=isFav(id)?favorites.filter(x=>x!==id):[...favorites,id];
  try{localStorage.setItem(FAV_KEY,JSON.stringify(favorites))}catch{}
  render(false);
  toast(isFav(id)?'已加入收藏':'已取消收藏');
}
function toast(message){
  const el=document.querySelector('#site-toast');
  if(!el)return;
  el.textContent=message;el.hidden=false;
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,2800);
}
function contactText(){
  return ['电话：'+(contacts.phone||'待配置'),'微信：'+(contacts.wechat||'待配置'),'地址：'+(contacts.address||'待配置')];
}
let gallery = [], photoIndex = 0;
let heroIndex=0, heroTimer=null, heroVersion=0, heroTouchX=null;
let wechatPreviousFocus=null;

const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const source = value => {
  const s = String(value || '');
  return /^\/(?:images|uploads)\/[a-zA-Z0-9_.-]+$/.test(s) ? s.slice(1) : '';
};
const byPosition = (a,b) => a.position - b.position;

async function load() {
  try {
    const [a,b,c] = await Promise.all([fetch('api/works'),fetch('api/categories'),fetch('api/site-config').catch(()=>null)]);
    if(c?.ok){const obj=await c.json();if(obj?.contacts)contacts=obj.contacts;}
    if (!a.ok || !b.ok) throw new Error('无法读取作品数据');
    works = (await a.json()).sort(byPosition);
    categories = await b.json();
    render();
  } catch (err) {
    app.innerHTML = '<div class="state-note"><h2>作品暂时无法载入</h2><p>请确认恩万婚礼服务已启动。</p></div>';
  }
}
function heroList(){return works.filter(w=>w.cover).slice(0,9)}
function heroMarkup(w,i,total){
  return '<section class="hero"><div class="hero-frame">' +
    '<a class="hero-main-link" href="#work/'+encodeURIComponent(w.id)+'" aria-label="查看'+escape(w.title)+'作品">' +
    '<img class="hero-main-image" src="'+source(w.cover)+'" alt="'+escape(w.title)+' 婚礼场景">' +
    '<div class="hero-copy"><p class="overline">ENWAN WEDDING COLLECTION</p><h1>'+escape(w.title)+'</h1>' +
    '<span class="hero-cta">探索这场婚礼 →</span></div></a>' +
    '<div class="hero-controls"><button type="button" data-hero-prev aria-label="上一张">‹</button>' +
    '<span class="hero-count" aria-live="polite">'+String(i+1).padStart(2,'0')+' / '+total+'</span>' +
    '<button type="button" data-hero-next aria-label="下一张">›</button></div></div></section>';
}
function stopHero(){
  if(heroTimer!==null)clearInterval(heroTimer);
  heroTimer=null;heroVersion++;
}
function changeHero(delta){
  const list=heroList(),mount=app.querySelector('[data-home-hero]');
  if(!mount||list.length<2)return;
  const next=(heroIndex+delta+list.length)%list.length, w=list[next], token=++heroVersion;
  const pre=new Image();
  const renderNext=()=>{
    if(token!==heroVersion||!app.contains(mount))return;
    heroIndex=next;
    mount.innerHTML=heroMarkup(w,next,list.length);
    mount.classList.add('hero-appearing');
    requestAnimationFrame(()=>mount.classList.remove('hero-appearing'));
  };
  pre.onload=renderNext;pre.onerror=renderNext;
  pre.src=source(w.cover);
  if(pre.complete)renderNext();
}
function startHero(){
  stopHero();
  if(document.hidden||heroList().length<2)return;
  heroTimer=setInterval(()=>changeHero(1),4300);
}
function manualHero(delta){
  changeHero(delta);
  if(heroTimer!==null)clearInterval(heroTimer);
  heroTimer=null;
  if(!document.hidden&&heroList().length>1)heroTimer=setInterval(()=>changeHero(1),4300);
}
function styleName(id) { return categories.find(item => item.id === id)?.name || ''; }
function card(work) {
  const photo = '<a class="card-photo" href="#work/' + encodeURIComponent(work.id) + '">' +
    '<img loading="lazy" decoding="async" src="' + source(work.cover) + '" alt="' + escape(work.title) + '"></a>';
  return '<article class="work-card">' + photo + '<div class="card-caption"><div><a href="#work/' +
    encodeURIComponent(work.id) + '"><h3>' + escape(work.title) + '</h3></a><p>' +
    escape(work.subtitle || styleName(work.category)) + '</p></div><button type="button" class="fav-button' +
    (isFav(work.id)?' active':'') + '" data-favorite="' + escape(work.id) + '" aria-label="' +
    (isFav(work.id)?'取消收藏':'收藏作品') + '" aria-pressed="' + isFav(work.id) + '">' +
    (isFav(work.id)?'♥':'♡') + '</button></div></article>';
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
function home(){
  const slides=heroList();
  if(heroIndex>=slides.length)heroIndex=0;
  const hero=slides.length?'<div data-home-hero>'+heroMarkup(slides[heroIndex],heroIndex,slides.length)+'</div>':'';
  const trust='<section class="trust-bar" aria-label="服务介绍">' +
    '<div class="trust-item"><strong>11年</strong><span>婚礼影像积累</span></div>' +
    '<div class="trust-item"><strong>4种风格</strong><span>纪实 · 时尚 · 唯美 · AI</span></div>' +
    '<div class="trust-item"><strong>当日快剪</strong><span>婚礼现场快速出片</span></div>' +
    '<div class="trust-item"><strong>任丘本地</strong><span>团队上门拍摄</span></div></section>';
  return hero+trust+'<section class="section-wrap"><div class="section-heading"><div>' +
    '<p class="overline">THE COLLECTION</p><h2>婚礼作品</h2>' +
    '<p>不同风格、不同区域，记录每一场婚礼的布置细节。</p></div>' +
    '<a href="#works" class="more-link">全部作品 →</a></div>'+filterBar()+grid()+'</section>';
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
    '</p><div class="detail-cta"><button type="button" class="button subtle fav-button-detail" data-favorite="'+escape(work.id)+'">'+(isFav(work.id)?'♥ 已收藏':'♡ 收藏作品')+'</button><a class="button solid" href="#inquiry?style='+encodeURIComponent(work.category)+'">咨询这种风格 →</a></div></div><span class="detail-count">' + images.length + ' PHOTOS</span></div>';
  if (!work.details.length) return body + '</section>';
  const photoGrid = work.details.map((item, index) =>
    '<button type="button" data-photo="' + (index + 1) + '" aria-label="查看第' + (index + 2) + '张婚礼照片">' +
    '<img loading="lazy" src="' + source(item.src) + '" alt="' + escape(item.alt || (work.title + '细节照片')) + '"></button>'
  ).join('');
  return body + '<div class="details-heading"><p class="overline">WEDDING DETAILS</p><h2>婚礼现场细节</h2></div>' +
    '<div class="photo-grid">' + photoGrid + '</div></section>';
}
function favoritesPage(){
  const saved=works.filter(w=>favorites.includes(w.id));
  return '<section class="section-wrap"><div class="section-heading"><div><p class="overline">SAVED MOMENTS</p>' +
    '<h2>我的收藏</h2><p>喜欢的婚礼作品会保存在当前设备浏览器中。</p></div></div>' +
    (saved.length?'<div class="work-grid">'+saved.map(card).join('')+'</div>':
    '<div class="state-note"><p>还没有收藏作品。</p><a class="button subtle" href="#works">浏览婚礼作品 →</a></div>')+'</section>';
}
function inquiryPage(){
  const hash=location.hash||'';
  const params=new URLSearchParams(hash.includes('?')?hash.split('?')[1]:'');
  const selected=params.get('style')||'';
  return '<section class="inquiry-page section-wrap"><div class="section-heading"><div>' +
    '<p class="overline">LET US PLAN TOGETHER</p><h2>婚礼咨询</h2>' +
    '<p>留下您的联系方式和婚礼想法，我们收到信息后会尽快与您联系。</p></div></div>' +
    '<div class="inquiry-layout"><form id="inquiry-form" class="inquiry-form">' +
    '<div class="form-cols"><label>称呼 <span>*</span><input name="name" required maxlength="60" autocomplete="name" placeholder="您的称呼"></label>' +
    '<label>联系电话 <span>*</span><input name="phone" required type="tel" inputmode="tel" maxlength="30" autocomplete="tel" placeholder="手机或其他联系电话"></label></div>' +
    '<div class="form-cols"><label>婚礼日期<input name="date" type="date"></label>' +
    '<label>婚礼地点<input name="place" maxlength="120" placeholder="城市 / 酒店"></label></div>' +
    '<label>喜欢的作品 / 风格<select name="category"><option value="">暂未确定</option>' +
    categories.map(c=>'<option value="'+escape(c.id)+'"'+(selected===c.id?' selected':'')+'>'+escape(c.name)+'</option>').join('')+
    '</select></label>' +
    '<label>其他需求<textarea name="notes" maxlength="800" rows="5" placeholder="比如：婚礼场景、布置偏好、特别想法等"></textarea></label>' +
    '<div class="honeypot" aria-hidden="true"><label>网站<input tabindex="-1" autocomplete="off" name="website"></label></div>' +
    '<p class="form-privacy">您的信息仅用于本次婚礼咨询沟通，请勿在此填写证件号码等敏感资料。</p>' +
    '<button class="button solid" id="inquiry-submit" type="submit">提交咨询 →</button>' +
    '<p id="inquiry-status" role="status" aria-live="polite"></p></form>' +
    '<aside class="contact-panel"><p class="overline">CONTACT ENWAN</p><h3>联系恩万婚礼</h3>' +
    contactText().map(t=>'<p>'+escape(t)+'</p>').join('')+
    '<p class="helper">联系方式由服务端配置，后续可替换为正式号码及地址。</p></aside></div></section>';
}
async function submitInquiry(form){
  const status=document.querySelector('#inquiry-status'),button=document.querySelector('#inquiry-submit');
  const f=new FormData(form);
  const body={name:String(f.get('name')||'').trim(),phone:String(f.get('phone')||'').trim(),
    date:String(f.get('date')||''),place:String(f.get('place')||'').trim(),
    category:String(f.get('category')||''),notes:String(f.get('notes')||'').trim(),
    website:String(f.get('website')||'')};
  button.disabled=true;status.textContent='正在提交…';
  try{
    const response=await fetch('api/inquiry',{method:'POST',headers:{'Content-Type':'application/json','X-Enwan-Action':'1'},body:JSON.stringify(body)});
    const json=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(json.error||'提交失败，请稍后再试');
    form.innerHTML='<div class="inquiry-success" role="status"><h3>咨询已提交</h3>' +
      '<p>我们已经收到您的婚礼咨询信息，会尽快与您联系。</p>' +
      '<a class="button subtle" href="#works">继续浏览婚礼作品 →</a></div>';
    toast('已提交');
  }catch(err){status.textContent=err.message||'提交失败';button.disabled=false;}
}
function render(scroll=true) {
  let hash;
  try {hash=decodeURIComponent(location.hash.replace(/^#/, '') || 'home');}catch{hash='home'}
  const [routeAndQuery,id] = hash.split('/');
  const section=routeAndQuery.split('?')[0];
  const work=section==='work'&&id?works.find(w=>w.id===id):null;
  const path=work?'work':['works','favorites','inquiry'].includes(section)?section:'home';
  document.querySelector('#nav-home').classList.toggle('active',path==='home');
  document.querySelector('#nav-works').classList.toggle('active',path==='works'||path==='work');
  document.querySelector('#nav-favorites').classList.toggle('active',path==='favorites');
  stopHero();
  if(path==='work'){
    gallery=[{src:work.cover,alt:work.title},...work.details];app.innerHTML=detail(work);
  }else{
    gallery=[];
    app.innerHTML=path==='works'?listing():path==='favorites'?favoritesPage():path==='inquiry'?inquiryPage():home();
    if(path==='home')startHero();
  }
  document.querySelector('#site-footer-contacts').textContent=contactText().join(' · ');
  if(scroll)window.scrollTo({top:0,behavior:'instant'});
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
  if(event.target.closest('[data-hero-prev]')){manualHero(-1);return;}
  if(event.target.closest('[data-hero-next]')){manualHero(1);return;}
  if(event.target.closest('[data-wechat]')){showWechat();return;}
  const fav=event.target.closest('[data-favorite]');
  if(fav){event.preventDefault();toggleFav(fav.dataset.favorite);return;}
  const filter = event.target.closest('[data-filter]');
  if (filter) { activeFilter = filter.dataset.filter; render(); return; }
  const image = event.target.closest('[data-photo]');
  if (image) openPhoto(Number(image.dataset.photo));
});
app.addEventListener('submit',event=>{
  if(event.target.id!=='inquiry-form')return;
  event.preventDefault();void submitInquiry(event.target);
});
document.querySelector('#footer-share').addEventListener('click',async()=>{
  const url=location.href,title='恩万婚礼 ENWAN WEDDING';
  if(navigator.share){try{await navigator.share({title,url});return;}catch(e){if(e.name==='AbortError')return;}}
  try{
    if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
    else{
      const input=document.createElement('textarea');input.value=url;input.style.position='fixed';input.style.opacity='0';
      document.body.append(input);input.select();
      if(!document.execCommand('copy'))throw Error('copy failed');
      input.remove();
    }
    toast('链接已复制，可以分享给朋友');
  }catch{toast('复制失败，请使用浏览器的分享功能');}
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
app.addEventListener('touchstart',e=>{
  if(e.target.closest('.hero-frame'))heroTouchX=e.changedTouches[0]?.clientX??null;
},{passive:true});
app.addEventListener('touchend',e=>{
  if(heroTouchX===null)return;
  const distance=(e.changedTouches[0]?.clientX??heroTouchX)-heroTouchX;heroTouchX=null;
  if(Math.abs(distance)>48&&e.target.closest('.hero-frame'))manualHero(distance<0?1:-1);
},{passive:true});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)stopHero();
  else if(app.querySelector('[data-home-hero]'))startHero();
});
window.addEventListener('hashchange',render);
load();
