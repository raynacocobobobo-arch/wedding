# 恩万婚礼 ENWAN WEDDING — 可移植完整项目

本目录是**可直接部署的完整项目**：前台婚礼作品展示 + 管理员后台 + 图片上传 API + 本地持久化存储。不依赖 GitHub Pages、Supabase 或任何指定云厂商；Node.js 22+ 即可运行，无需安装额外 npm 库。可迁移到腾讯云、其他 VPS 或 Docker 环境。

**重要：** 现有 GitHub Pages 的 V5.1 前台保留在仓库根目录，未被本项目覆盖。GitHub 保存本系统的源代码、部署配置及初始9张照片；真正上传图片必须启动 Node.js 服务端。GitHub Pages 不能执行服务端上传接口。

## 数据层级

- **风格分类**：保留9种（传统中式、布幔咖色、布幔粉色、新中式、森系、欧式、法式花园、老钱风、韩式）。
- **婚礼作品**：每个分类可以新增多场独立婚礼。
- **一级图片**：每场婚礼一张主封面，首页和作品列表展示。
- **二级图片**：每场婚礼可上传多张详情图，支持批量上传、拖动排序、移动按钮排序和删除。
- **草稿 / 发布**：只有已发布且具有主封面的作品会出现在前台。

初次启动自动导入现有9个风格、每个风格1张封面作为初始作品，**不会虚构任何细节图**。以后所有新上传数据都保存在 data/ 目录。

## 本地启动（macOS / Windows / Linux）

需要 Node.js 22 或更高版本。

1. 克隆仓库：git clone https://github.com/raynacocobobobo-arch/wedding.git
2. 进入目录：cd wedding/portable
3. 复制配置：cp .env.example .env（Windows 可以手动复制文件）。
4. 编辑 .env，将 ADMIN_PASSWORD 设置为独有且至少12字符的高强度密码；COOKIE_SECRET 改为至少32字符的随机密钥（可运行 openssl rand -hex 32 生成）。
5. 执行 npm start。
6. 前台：http://127.0.0.1:3000/
7. 后台：http://127.0.0.1:3000/admin

.env 包含管理员密码和签名密钥，已加入 .gitignore。**不要提交到 GitHub，也不要放进前端脚本。**

## 后台操作

1. 打开 /admin，使用 .env 中的管理员密码登录。
2. 选择一场现有婚礼，或点击「新建」创建独立作品。
3. 上传/替换一级封面，或批量上传二级细节图（JPG、PNG、WebP，每张不超过12MB）。
4. 使用拖动或 ← → 按钮调整详情图的展示顺序。
5. 修改名称、风格、介绍、首页排序，勾选「公开发布」并保存。
6. 前台自动读取已发布作品，无须每次重新提交 GitHub。

说明：图片上传会立即保存到服务器；名称、风格、排序及发布状态需要点击「保存作品」。

## 正式部署和 HTTPS

推荐在服务器上运行 Node.js，使用 Caddy 或 Nginx 做 HTTPS 反向代理至 127.0.0.1:3000。参考 Caddyfile.example。配置实际域名且确认 HTTPS 可用后，将 .env 中 COOKIE_SECURE=1；本地明文 HTTP 调试时应为 0。

Docker 部署：先创建目录 data 并确保容器内 UID 1000 对目录有写入权限（Linux 示例：mkdir -p data && sudo chown -R 1000:1000 data），然后执行 docker compose up -d --build。compose.yml 只把 3000 端口映射至服务器回环地址，避免未配置 HTTPS 时直接暴露公网。

## 数据目录与完整迁移

- data/works.json：作品名称、封面引用、细节图次序、分类、发布状态。
- data/uploads/：实际上传的 JPG、PNG、WebP 图片。
- public/images/：仓库自带的9张风格封面与恩万婚礼 Logo。
- 后台「导出数据」只下载作品的 JSON **元数据**，不包含图片二进制。

**完整迁移步骤：** 停止服务 → 备份整个 portable/data/（包含 works.json 和 uploads 目录）→ 在新服务器克隆同一版本仓库 → 复制 data/ → 配置新的 .env 和域名 HTTPS → 启动服务。

不要只复制 JSON 或只下载仓库，否则新上传的图片无法迁移。可以将 DATA_DIR 指向外部持久存储卷。

该方案采用单机原子写入 JSON，适合小型作品展示站，**不能把多个 Node 进程同时指向同一个 data 目录并发写入**。未来若扩容可将同样的数据结构迁入 PostgreSQL 和对象存储。

## 安全与功能边界

- 管理员密码配置仅在服务端，Cookie 使用签名、HttpOnly、SameSite=Strict，登录默认12小时有效；服务重启需重新登录。
- 操作接口要求认证与自定义写入请求头；限制单文件12MB，服务端校验 PNG/JPG/WebP 文件签名。
- 不应公开 .env 或 data/uploads。正式服务需要 HTTPS、自动备份与安全更新。
- 第一版为单管理员后台；尚无多用户角色、图片自动转码、回收站和自动备份服务。

## API

- GET /api/categories、GET /api/works：公开分类和已发布作品。
- POST /api/admin/login、POST /api/admin/logout、GET /api/admin/me：认证。
- GET/POST /api/admin/works、PATCH/DELETE /api/admin/works/:id：作品管理。
- POST /api/admin/works/:id/images?role=cover 或 detail：上传图片，图片原始字节作为请求体。
- PATCH /api/admin/works/:id/details-order、DELETE /api/admin/works/:id/images/:imageId：细节图排序与删除。
- GET /api/admin/export：导出作品元数据。
- GET /api/health：健康检查。

写入接口需同源管理会话及 X-Enwan-Action: 1 请求头。前后台同源部署，不开放跨域管理 API。

## 自动验证

运行 npm test 可检查初始数据、管理员登录、作品创建、封面/细节上传、公开发布、细节排序和删除。

## 素材授权

婚礼图片及品牌 Logo 由项目所有者提供，保留原有权利。此仓库不因此授权第三方转载或商用这些素材。


## 企微通知及客户咨询

前台新增 #inquiry 咨询表单，提交到同源 /api/inquiry，信息先持久保存在 data/inquiries.json，然后由服务端推送到企微群机器人。请把 WECOM_WEBHOOK 配在私有 .env 中（不能提交 GitHub）；如果未配置或发送失败，咨询仍保留为 pending 并自动重试。后台已提供需认证的 GET /api/admin/inquiries 读取咨询记录接口。

后台可配置 CONTACT_PHONE、CONTACT_WECHAT、CONTACT_ADDRESS，留空则前台显示“待配置”。收藏只保存在当前浏览器 localStorage；分享优先使用系统分享，回退复制链接。

**部署子路径：** 腾讯云当前在 /wedding/ 下代理本项目；页面保留 base href=/wedding/ 且服务端接受 /wedding/* 路径。代理必须保留原始 URI 前缀，不得重复添加或剥除路径。如需换路径，须同步更新 HTML base 与代理规则。

**可信代理 IP：** 若 Node 只监听本机回环并通过 Nginx/Caddy 代理，设置 TRUST_PROXY=1，并保证反向代理始终覆盖 X-Real-IP 为真实客户端地址（例如 Nginx: proxy_set_header X-Real-IP $remote_addr;）。未开启时将按直连 IP 限流，共用一个反代 IP 可能触发误限流。请勿让任意公网请求自行伪造 X-Real-IP。

**数据备份：** 除 data/works.json 和 data/uploads 外，还须备份 data/inquiries.json；这里包含客户姓名、电话，属于私密资料，请控制访问权限、保存周期和备份范围。
