import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const [html,css,js]=await Promise.all([
  readFile(join(root,'public/index.html'),'utf8'),
  readFile(join(root,'public/assets/app.css'),'utf8'),
  readFile(join(root,'public/assets/site.js'),'utf8')
]);
test('mobile header stays a normal website and customer actions are not duplicated',()=>{
  assert.match(html,/<base href="\/wedding\/">/);
  assert.match(html,/id="footer-share"/);
  assert.match(html,/id="footer-wechat"/);
  assert.match(html,/id="wechat-float"/);
  assert.doesNotMatch(html,/href="#inquiry">婚礼咨询/);
  assert.doesNotMatch(html,/class="island"|class="system-right"|电池电量/);
  assert.match(css,/\.sticky-actions/);
  assert.match(css,/\.wechat-dialog/);
  assert.match(js,/function showWechat/);
});
test('home hero is dynamic, not a static 01 / 9 caption',()=>{
  assert.match(js,/function heroList/);
  assert.match(js,/function heroMarkup/);
  assert.match(js,/setInterval\(\(\)=>changeHero\(1\),4300\)/);
  assert.match(js,/padStart\(2,'0'\)/);
  assert.match(js,/data-hero-prev/);
  assert.match(js,/data-hero-next/);
  assert.match(js,/touchstart/);
  assert.match(js,/touchend/);
  assert.match(js,/function stopHero/);
  assert.doesNotMatch(js,/hero-count">01 \//);
});
test('trust values use compact single-row layout on mobile',()=>{
  assert.match(js,/trust-bar/);
  assert.match(js,/11年/);
  assert.match(css,/\.trust-bar\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css,/\.trust-item strong\{font-size:15px/);
  assert.match(css,/@media\(max-width:700px\)[\s\S]*?\.trust-item strong\{font-size:12px/);
});
test('old large consultation section is gone; existing inquiry and gallery are retained',()=>{
  const home=js.slice(js.indexOf('function home()'),js.indexOf('function listing()'));
  assert.doesNotMatch(home,/home-contact|留言咨询|婚礼咨询/);
  assert.match(js,/function inquiryPage/);
  assert.match(js,/function submitInquiry/);
  assert.match(js,/function favoritesPage/);
  assert.match(js,/function detail\(work\)/);
  assert.match(js,/function openPhoto/);
  assert.match(js,/function showWechat/);
  assert.match(js,/images\/wechat-qr\.png/);
  assert.match(js,/扫码添加微信/);
});
