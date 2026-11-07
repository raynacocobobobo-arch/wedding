# 恩万婚礼：腾讯云仅同步前台（2026-11-07）

## 本次只取3个文件

1. portable/public/index.html
2. portable/public/assets/site.js
3. portable/public/assets/app.css

目标是云端对应的 public/ 目录。本次前台实现：手机端紧凑的单行四项介绍；首页真实的封面自动轮播（动态01 / N、按钮与手势切换）；底部分享与统一的微信二维码咨询。原有收藏、作品详情、咨询表单API和后台功能继续保留。

## 禁止覆盖的内容

- .env、账号密钥、企微 Webhook、CONTACT 联系方式
- data/ 全目录（works.json、inquiries.json、uploads/ 和所有实际持久化数据）
- public/images/ 全目录（原9张图、Logo、微信真实二维码 wechat-qr.png、后续上传素材）
- server.mjs、public/admin.html、public/assets/admin.js
- 云端的 Nginx/Caddy 代理、Docker/持久卷、COS、其他业务和备份

**云端微信二维码必须保留原始文件。** 前端 JS 内置二维码缺失时的备用扫码显示，但不需要、也不允许替换云端原图。

## 已有 Git 工作区时

请首先将线上对应的3个旧文件备份到 webroot 之外；再在仓库根目录执行：

    git fetch origin main
    git restore --source=origin/main -- \
      portable/public/index.html \
      portable/public/assets/site.js \
      portable/public/assets/app.css

只替换这3个文件。不要运行 git pull、git reset --hard、git clean 或 docker compose down -v。先确认运行目录是否与仓库目录相同，若不同，再手动复制这3个文件到云端对应 public/ 路径，不得复制整个目录。

## 云端不是 Git 工作区时

分别下载以下3个 Raw 文件到临时位置，检查后只替换对应文件：

https://raw.githubusercontent.com/raynacocobobobo-arch/wedding/main/portable/public/index.html
https://raw.githubusercontent.com/raynacocobobobo-arch/wedding/main/portable/public/assets/site.js
https://raw.githubusercontent.com/raynacocobobobo-arch/wedding/main/portable/public/assets/app.css

注意：下载之前检查链接域名和仓库名为 raynacocobobobo-arch/wedding，文件要从 main 的 portable/public 目录取。请先测试下载不是 404，JS 通过 node --check 后再上线。

## 最低验收

1. 首页轮播显示真实 01 / N，自动切换、左右箭头和手机横滑可用。
2. 四项介绍在手机上紧凑排列成一行，不再占据半屏。
3. 底部只有 分享 + 加微信咨询；点击后显示原始微信二维码；不再重复显示大块咨询区。
4. 收藏、作品详情、分享、后台上传、草稿发布及前台展示继续正常。
5. 原有所有作品数据与实际上传文件均无变化；不要为了测试删除或覆盖用户图片。

如有差异，只修前台3文件与对应缓存，不得用数据重建或整仓覆盖处理。
