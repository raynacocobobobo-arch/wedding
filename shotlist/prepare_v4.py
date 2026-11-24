#!/usr/bin/env python3
"""Upgrade an already audited V4 import. Preserve all original V3 image/data files."""
import argparse
import hashlib
import html
import json
from pathlib import Path
from urllib.parse import quote
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent

def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")

def esc(value):
    return html.escape(str(value), quote=True)

def classify(card):
    title = card.get("title", "")
    cat = card.get("cat", "")
    if cat == "单人摆拍":
        if "眼镜" in title:
            return "新郎单人 · 摆拍"
        if "头发" in title or "眼部" in title:
            return "新娘单人 · 摆拍"
        return "通用单人 · 摆拍"
    return cat

def build():
    manifest = ROOT / "v4-guide-data.json"
    cards = json.loads(manifest.read_text(encoding="utf-8"))
    if not cards:
        raise ValueError("Empty V4 manifest")
    assets = set()
    for card in cards:
        card["display_category"] = classify(card)
        refs = []
        for ref in card.get("images", []):
            source = (ROOT / ref).resolve(strict=True)
            source.relative_to(ROOT.resolve())
            if not source.is_file():
                raise ValueError("Invalid reference " + ref)
            key = hashlib.sha256(source.read_bytes()).hexdigest()[:24]
            relative = "v4-thumbs/" + key + ".jpg"
            target = ROOT / relative
            if not target.exists():
                target.parent.mkdir(exist_ok=True)
                with Image.open(source) as im:
                    im = ImageOps.exif_transpose(im)
                    im.thumbnail((960, 640), Image.Resampling.LANCZOS)
                    if im.mode in ("RGBA", "LA") or "transparency" in im.info:
                        canvas = Image.new("RGB", im.size, "white")
                        rgba = im.convert("RGBA")
                        canvas.paste(rgba, mask=rgba.getchannel("A"))
                        im = canvas
                    im.convert("RGB").save(target, quality=83, optimize=True)
            refs.append({"original": "../" + quote(ref, safe="/"), "thumb": "../" + relative})
            assets.update(("../" + quote(ref, safe="/"), "../" + relative))
        card["references"] = refs
    cats = list(dict.fromkeys(c["display_category"] for c in cards))
    parts = []
    for i, cat in enumerate(cats):
        sections = []
        for c in (x for x in cards if x["display_category"] == cat):
            gallery = "".join(
                '<button class="ref" type="button" data-full="' + esc(ref["original"]) + '" aria-label="查看高清参考图 ' + str(j+1) + '"><img loading="lazy" decoding="async" src="' + esc(ref["thumb"]) + '" alt="参考图 ' + str(j+1) + '"></button>'
                for j, ref in enumerate(c["references"])
            )
            count = len(c["references"])
            warning = "" if count >= 4 else '<p class="muted">参考图 ' + str(count) + ' 张 · 待补充，不用无关图凑数。</p>'
            sections.append('<article data-category="' + esc(cat) + '"><div class="meta">' + esc(c["id"]) + ' · 选拍 · 参考稿第' + esc(c.get("page","")) + '页</div><h3>' + esc(c["title"]) + '</h3><div class="gallery">' + gallery + '</div>' + warning + '<p><strong>现场口令：</strong>' + esc(c.get("prompt","")) + '</p><p><strong>摄影机：</strong>' + esc(c.get("camera","")) + '</p></article>')
        parts.append('<section id="cat-' + str(i) + '"><h2>' + esc(cat) + '</h2>' + "".join(sections) + '</section>')
    nav = "".join('<a href="#cat-' + str(i) + '">' + esc(c) + '</a>' for i,c in enumerate(cats))
    page = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>恩万婚礼 · 创作镜头补充库</title><link rel="stylesheet" href="style.css"></head><body>
<header><a href="../index.html">← 返回婚礼流程与原有镜头库</a><h1>创作镜头补充库</h1><p>纪实优先 · 自然引导 · 创意选拍</p></header><main>
<div class="toolbar"><input id="search" type="search" placeholder="搜索动作、构图、运镜" aria-label="搜索镜头"><button id="offline" type="button" disabled>下载本库离线参考图</button><p id="offline-status" role="status">离线功能需要 HTTPS 或 localhost。</p></div>
<nav aria-label="镜头分类">""" + nav + """</nav><p class="muted">本库仅作创作选拍，保留原有男方、女方流程及全部参考图；不计入必拍完成率。</p>""" + "".join(parts) + """</main>
<dialog id="lightbox"><button id="close" type="button" aria-label="关闭">关闭</button><img id="full" alt="高清参考图"></dialog><script src="app.js" defer></script></body></html>"""
    write(ROOT / "v4/index.html", page)
    write(ROOT / "v4/style.css", """
:root{color-scheme:light;--bg:#f7f7f4;--text:#222b27;--sub:#68736e;--line:#d9dedb;--accent:#365d51}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.65 system-ui,sans-serif}header{padding:24px max(18px,calc((100% - 1000px)/2));background:#fff;border-bottom:1px solid var(--line)}header a{color:var(--accent)}h1{font-size:25px;line-height:1.3;margin:12px 0 4px}header p{color:var(--sub);margin:0}main{max-width:1040px;margin:auto;padding:18px}h2{font-size:19px;margin:25px 0 12px}h3{font-size:17px;margin:3px 0 10px}nav{display:flex;gap:7px;flex-wrap:wrap;margin:16px 0}nav a{color:var(--text);text-decoration:none;border:1px solid var(--line);background:white;border-radius:6px;padding:7px 10px}article{background:white;border:1px solid var(--line);border-radius:10px;padding:15px;margin:10px 0}article p{margin:8px 0}.meta,.muted,#offline-status{font-size:12px;color:var(--sub)}.gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.ref{padding:0;border:0;background:#eeefec;cursor:zoom-in;border-radius:5px;overflow:hidden}.ref img{width:100%;display:block;aspect-ratio:16/10;object-fit:contain}input,button{font:inherit}input{width:100%;padding:10px;border:1px solid var(--line);border-radius:6px;background:white}#offline,#close{padding:8px 12px;border:0;border-radius:6px;background:var(--accent);color:white;cursor:pointer}#offline{margin-top:8px}#offline:disabled{opacity:.55}dialog{max-width:96vw;border:0;padding:10px;background:#1f2421;color:white;border-radius:8px}dialog::backdrop{background:#000b}#full{display:block;max-width:92vw;max-height:81vh;object-fit:contain;margin-top:8px}[hidden]{display:none!important}@media(min-width:680px){.gallery{grid-template-columns:repeat(3,minmax(0,1fr))}}
""".strip())
    write(ROOT / "v4/app.js", """
'use strict';
const search=document.querySelector('#search'), lightbox=document.querySelector('#lightbox'), full=document.querySelector('#full');
search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();document.querySelectorAll('article').forEach(a=>a.hidden=!a.textContent.toLowerCase().includes(q));document.querySelectorAll('section').forEach(s=>s.hidden=![...s.querySelectorAll('article')].some(a=>!a.hidden))});
document.querySelectorAll('.ref').forEach(b=>b.addEventListener('click',()=>{full.src=b.dataset.full;lightbox.showModal()}));
document.querySelector('#close').addEventListener('click',()=>lightbox.close());
lightbox.addEventListener('close',()=>full.removeAttribute('src'));
const offline=document.querySelector('#offline'), status=document.querySelector('#offline-status');
if ('serviceWorker' in navigator && window.isSecureContext){
 navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(async reg=>{
  const activate=()=>{if(reg.active&&navigator.serviceWorker.controller&&navigator.serviceWorker.controller.scriptURL===new URL('./sw.js',location.href).href){offline.disabled=false;status.textContent='可提前下载本库参考图。'}};
  navigator.serviceWorker.addEventListener('controllerchange',activate);
  activate();
  offline.addEventListener('click',()=>{
   const controller=navigator.serviceWorker.controller;
   if(!controller||controller.scriptURL!==new URL('./sw.js',location.href).href)return;
   offline.disabled=true;status.textContent='正在下载…';
   const channel=new MessageChannel();
   channel.port1.onmessage=e=>{const d=e.data;status.textContent=d.error?'下载失败：'+d.error:'已缓存 '+d.done+' / '+d.total+' 项';if(d.error||d.done===d.total){offline.disabled=false;channel.port1.close()}};
   controller.postMessage({type:'DOWNLOAD_V4'},[channel.port2]);
  });
 }).catch(e=>status.textContent='离线初始化失败：'+e.message);
}
""".strip())
    asset_list = sorted(assets)
    version = hashlib.sha256((page + json.dumps(asset_list)).encode()).hexdigest()[:16]
    worker = """
'use strict';
const CACHE='enwan-shotlist-v4-""" + version + """';
const SHELL=['./','./index.html','./style.css','./app.js'];
const MEDIA=""" + json.dumps(asset_list, ensure_ascii=True) + """;
const absolute=rel=>new URL(rel,self.registration.scope).href;
const allowed=new Set([...SHELL,...MEDIA].map(absolute));
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('enwan-shotlist-v4-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET'||!allowed.has(e.request.url))return;
 e.respondWith((async()=>{const c=await caches.open(CACHE),old=await c.match(e.request);if(old)return old;const response=await fetch(e.request);if(response.ok)await c.put(e.request,response.clone());return response})());
});
self.addEventListener('message',e=>{
 if(e.data?.type!=='DOWNLOAD_V4'||!e.ports[0])return;
 const port=e.ports[0];
 e.waitUntil((async()=>{try{const c=await caches.open(CACHE),all=[...new Set([...SHELL,...MEDIA])];let done=0;for(const url of all){const u=absolute(url);if(!await c.match(u)){const r=await fetch(u);if(!r.ok)throw Error(url+' HTTP '+r.status);await c.put(u,r)}port.postMessage({done:++done,total:all.length})}}catch(err){port.postMessage({error:err.message})}})());
});
"""
    write(ROOT / "v4/sw.js", worker)
    # Only modify the V4-specific link, not other home page logic.
    home = ROOT / "index.html"
    text = home.read_text(encoding="utf-8")
    old = 'href="v4-guide.html"'
    new = 'href="v4/index.html"'
    if old not in text and new not in text:
        raise ValueError("Cannot locate V4 home entry")
    write(home, text.replace(old, new))
    write(ROOT / "v4-guide.html", '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=v4/index.html"><title>恩万婚礼创作镜头库</title><a href="v4/index.html">进入创作镜头库</a></html>')
    report = {"cards": len(cards), "categories": {c:sum(x["display_category"]==c for x in cards) for c in cats}, "reference_images": len({ref["original"] for c in cards for ref in c["references"]}), "thumbnail_files": len({ref["thumb"] for c in cards for ref in c["references"]}), "offline_scope": "v4/", "visual_review_required": True, "existing_library_merge": "not performed; supplement remains separate"}
    write(ROOT / "v4-preparation.json", json.dumps(report, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    build()
