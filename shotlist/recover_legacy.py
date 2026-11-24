#!/usr/bin/env python3
import concurrent.futures as cf
import hashlib
import io
import json
import re
import time
import urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
BASE = "https://bjenwan.com/shotlist/"
SOURCE = ROOT / "legacy-source"
ASSETS = ROOT / "assets/references/legacy"

def fetch(path):
    for attempt in range(3):
        try:
            req = urllib.request.Request(BASE + path, headers={"User-Agent":"Enwan-shotlist-migration/1.0"})
            with urllib.request.urlopen(req, timeout=25) as r:
                data = r.read(25_000_001)
                if len(data) > 25_000_000:
                    raise ValueError("Oversized resource " + path)
                return data
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt+1)

def decode_js(b, variable):
    s = b.decode("utf-8-sig").strip()
    prefix = "window." + variable + " = "
    if not s.startswith(prefix):
        raise ValueError("Unexpected JavaScript format")
    return json.loads(s[len(prefix):].rstrip(";").strip())

def download(job):
    side, n = job
    folder = ASSETS / side
    full = folder / "f" / (str(n)+".jpg")
    thumb = folder / "t" / (str(n)+".jpg")
    for typ, dest in (("f", full), ("t", thumb)):
        if not dest.exists():
            data = fetch("img/"+side+"/"+typ+"/"+str(n)+".jpg")
            with Image.open(io.BytesIO(data)) as im:
                if im.format != "JPEG":
                    raise ValueError("Not a JPEG: " + str(dest))
                im.verify()
            dest.parent.mkdir(parents=True,exist_ok=True)
            dest.write_bytes(data)
    return str(full.relative_to(ROOT).as_posix())

def main():
    target = ROOT / "data.js"
    data = decode_js(target.read_bytes(), "ENWAN_DATA")
    data["cards"] = [c for c in data["cards"] if not c["id"].startswith("L-")]
    data["stages"] = [s for s in data["stages"] if not s["id"].startswith("L-")]
    SOURCE.mkdir(exist_ok=True)
    jobs, source_groups, legacy = set(), [], {}
    for side, file in (("groom","data.js"),("bride","data-bride.js")):
        src = decode_js(fetch(file),"WEDDING_DATA")
        if src["side"] != side:
            raise ValueError("Wrong side in source")
        legacy[side] = src
        (SOURCE/(side+".json")).write_text(json.dumps(src,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        for seg in src["segs"]:
            nums = list(dict.fromkeys(seg.get("imgs",[])))
            if any(type(n) is not int or n<1 for n in nums):
                raise ValueError("Invalid image ID")
            jobs.update((side,n) for n in nums)
            if nums:
                source_groups.append((side,seg,nums))
    failures=[]
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        futures={ex.submit(download,j):j for j in sorted(jobs)}
        for f in cf.as_completed(futures):
            try: f.result()
            except Exception as e: failures.append({"side":futures[f][0],"number":futures[f][1],"error":str(e)})
    if failures:
        print(json.dumps(failures,ensure_ascii=False))
        raise SystemExit("Source image migration incomplete; no commit")
    # Original group names and source image order are preserved. Divide only for display.
    # No claim that the first five photos form a continuous motion sequence.
    category_map={
      "P1":"原流程参考 · 环境与静物","Q1":"原流程参考 · 环境与静物",
      "P2":"原流程参考 · 新郎准备","Q2":"原流程参考 · 新娘准备",
      "Q3":"原流程参考 · 家庭与亲友","P3":"原流程参考 · 接亲与转场",
      "P4":"原流程参考 · 接亲与转场","P5":"原流程参考 · 接亲与转场",
      "Q4":"原流程参考 · 接亲与转场","P6":"原流程参考 · 婚礼仪式","Q5":"原流程参考 · 婚礼仪式"}
    for side, seg, nums in source_groups:
        count = (len(nums)+4)//5
        # distribute 6–10 images more evenly instead of leaving a one-image last card
        size, rem=divmod(len(nums),count)
        at=0
        for i in range(count):
            chunk=nums[at:at+size+(i<rem)]
            at+=len(chunk)
            label="男方" if side=="groom" else "女方"
            name=seg["title"]+" · "+label+(("（"+str(i+1)+"/"+str(count)+"）") if count>1 else "")
            data["cards"].append({
                "id":"L-"+side+"-"+str(seg["n"]).zfill(2)+"-"+str(i+1),
                "category":category_map.get(seg["phase"],"原流程参考 · 其他"),
                "title":name,"prompt":"原流程拍摄点："+ "；".join(it["t"] for it in seg["items"]),
                "camera":seg.get("spec","") + ("；"+seg["tip"] if seg.get("tip") else ""),
                "images":["assets/references/legacy/"+side+"/f/"+str(n)+".jpg" for n in chunk],
                "source":"bjenwan.com/shotlist/"+side+".html","source_segment":seg["n"],"source_image_ids":chunk
            })
    # Restore the old detailed process as a separate, clearly labelled set, not a replacement
    # for the new compact checklist. Preserve item text, original tip and side.
    for side, src in legacy.items():
        for phase in src["phases"]:
            rows=[]
            for seg in src["segs"]:
                if seg["phase"] != phase["id"]:
                    continue
                for i,it in enumerate(seg["items"]):
                    rows.append({"id":"L-"+side+"-"+str(seg["n"])+"-"+str(i+1),
                        "title":seg["title"]+"： "+it["t"],
                        "side":side,"priority":"选拍" if it.get("add") else "必拍",
                        "source_tip":it.get("h","")})
            if rows:
                data["stages"].append({"id":"L-"+side+"-"+phase["id"],"title":"原流程 · "+("男方" if side=="groom" else "女方")+" · "+phase["name"],
                    "desc":"原站详细流程保留；按实际婚礼环节选用。","items":rows})
    target.write_text("window.ENWAN_DATA = "+json.dumps(data,ensure_ascii=False,indent=2)+";\n",encoding="utf-8")
    app=ROOT/"app.js"
    js=app.read_text(encoding="utf-8")
    # Use actual source thumbnails for the gallery, while the full original opens in the lightbox.
    old="im.src=u;im.alt=c.title"
    new="im.src=u.includes('/assets/references/legacy/')?u.replace('/f/','/t/'):u;im.alt=c.title"
    if old in js: js=js.replace(old,new)
    elif new not in js: raise ValueError("Gallery renderer not recognized")
    old="refs:[...new Set(cards.flatMap(refs))]"
    new="refs:[...new Set(cards.flatMap(c=>refs(c).flatMap(u=>u.includes('/assets/references/legacy/')?[u,u.replace('/f/','/t/')]:[u])))]"
    if old in js: js=js.replace(old,new)
    elif new not in js: raise ValueError("Offline renderer not recognized")
    # Distinguish source groups from new motion cards in the filter.
    app.write_text(js,encoding="utf-8")
    report={"source":"https://bjenwan.com/shotlist/","source_groups_with_images":len(source_groups),
      "original_full_images":len(jobs),"original_thumbnails":len(jobs),
      "legacy_cards":sum(c["id"].startswith("L-") for c in data["cards"]),
      "original_source_items":sum(len(s["items"]) for s in data["stages"] if s["id"].startswith("L-")),
      "new_cards_with_images":sum(bool(c["images"]) for c in data["cards"] if not c["id"].startswith("L-")),
      "new_cards":sum(not c["id"].startswith("L-") for c in data["cards"]),
      "source_docx_images_imported":False,"failures":[]}
    (ROOT/"reference-import-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False))

if __name__=="__main__":
    main()
