#!/usr/bin/env python3
"""Restore byte-identical Word images from the dedicated JSONL transfer branch."""
import base64, collections, hashlib, io, json, re, subprocess
from pathlib import Path
from PIL import Image, ImageOps
ROOT = Path(__file__).resolve().parent
ASSETS=ROOT/"assets/references/word"
THUMBS=ROOT/"assets/references/word-thumbs"
SOURCE=ROOT/"word-source"
def git(*args): return subprocess.check_output(["git",*args],cwd=ROOT.parent)
def read_data(): return json.loads((ROOT/"data.js").read_text(encoding="utf-8").strip().removeprefix("window.ENWAN_DATA = ").removesuffix(";"))
def write_json(path, obj): path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
def validate(row, data):
    p=row["path"]
    if not re.fullmatch(r"[0-9a-f]{64}\.(?:jpeg|jpg|png|webp|gif|bmp)",p,re.I):
        raise ValueError("Unsafe image path "+p)
    if row["source"] not in ("婚礼.docx","常规调度_副本2.docx"):
        raise ValueError("Invalid source")
    if len(data)!=row["bytes"] or hashlib.sha256(data).hexdigest()!=row["sha256"] or p.split(".")[0]!=row["sha256"]:
        raise ValueError("Source hash/size mismatch: "+p)
    with Image.open(io.BytesIO(data)) as im: im.verify()
def thumb(path, dest):
    if dest.exists(): return
    with Image.open(path) as im:
        im=ImageOps.exif_transpose(im)
        im.thumbnail((880,600),Image.Resampling.LANCZOS)
        if im.mode in ("RGBA","LA") or "transparency" in im.info:
            c=Image.new("RGB",im.size,"white")
            rgba=im.convert("RGBA")
            c.paste(rgba,mask=rgba.getchannel("A")); im=c
        im.convert("RGB").save(dest,quality=82,optimize=True)
def main():
    for p in (ASSETS,THUMBS,SOURCE): p.mkdir(parents=True,exist_ok=True)
    rows={}
    for p in sorted(SOURCE.glob("batch-*.json")):
        for r in json.loads(p.read_text(encoding="utf-8")):
            validate(r,(ASSETS/r["path"]).read_bytes())
            rows[r["sha256"]]=r
    index=SOURCE/"index.json"
    if index.exists():
        for r in json.loads(index.read_text(encoding="utf-8")):
            validate(r,(ASSETS/r["path"]).read_bytes())
            rows[r["sha256"]]=r
    git("fetch","--no-tags","origin","refs/heads/shotlist-word-transfer")
    ref=git("rev-parse","FETCH_HEAD").decode().strip()
    packs=git("ls-tree","-r","--name-only",ref,"transfer/").decode().splitlines()
    if not packs: raise ValueError("No transfer records")
    for pack in sorted(packs):
        if not re.fullmatch(r"transfer/\d{4}-\d{2}\.jsonl",pack): raise ValueError("Unexpected pack")
        for line in git("show",ref+":"+pack).decode("utf-8").splitlines():
            if not line.strip(): continue
            r=json.loads(line); data=base64.b64decode(r.pop("b64"),validate=True)
            validate(r,data)
            dst=ASSETS/r["path"]
            if dst.exists() and dst.read_bytes()!=data: raise ValueError("Existing original conflict")
            if not dst.exists(): dst.write_bytes(data)
            rows[r["sha256"]]=r
    def order(r):
        m=re.search(r"(\d+)",r["original"])
        return (0 if r["source"]=="婚礼.docx" else 1,int(m.group(1)) if m else 999999,r["original"])
    ordered=sorted(rows.values(),key=order)
    for r in ordered: thumb(ASSETS/r["path"],THUMBS/(r["sha256"]+".jpg"))
    write_json(index,ordered)
    data=read_data()
    data["cards"]=[c for c in data["cards"] if not c["id"].startswith("W-")]
    groups=collections.defaultdict(list)
    for r in ordered: groups[(r["source"],r["category"])].append(r)
    for (source,cat),rs in groups.items():
        key=hashlib.sha256((source+"|"+cat).encode()).hexdigest()[:12]
        count=(len(rs)+4)//5
        size,rem=divmod(len(rs),count); at=0
        for i in range(count):
            chunk=rs[at:at+size+(i<rem)]; at+=len(chunk)
            data["cards"].append({"id":"W-"+key+"-"+str(i+1).zfill(3),
              "category":"婚礼原稿参考" if source=="婚礼.docx" else "常规调度原稿参考",
              "title":cat+((" · "+str(i+1)+"/"+str(count)) if count>1 else ""),
              "prompt":"按原稿题目保留的素材；依据现场实际情况选拍，不要求新人表演。",
              "camera":"按文档图片编号排列；连续镜头需进一步逐帧核对。",
              "images":["assets/references/word/"+r["path"] for r in chunk],
              "reference_note":source+" · "+cat+"；内嵌原图，已校验 SHA-256。此处仅为原稿归档，不代表已完成动作语义匹配。"})
    (ROOT/"data.js").write_text("window.ENWAN_DATA = "+json.dumps(data,ensure_ascii=False,indent=2)+";\n",encoding="utf-8")
    report=json.loads((ROOT/"reference-import-report.json").read_text(encoding="utf-8"))
    report.update({"word_original_images":len(ordered),"word_thumbnails":len(ordered),
      "word_images_by_source":dict(collections.Counter(r["source"] for r in ordered)),
      "word_source_cards":sum(c["id"].startswith("W-") for c in data["cards"]),
      "word_expected_originals":1482,"source_docx_images_imported":len(ordered)==1482,
      "word_source_groups":len(groups),"word_transfer_commit":ref,"word_image_hash_failures":0})
    write_json(ROOT/"reference-import-report.json",report)
    print(json.dumps(report,ensure_ascii=False))
if __name__=="__main__":main()
