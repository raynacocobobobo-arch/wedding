# 恩万婚礼 ENWAN WEDDING

此仓库包含两部分，互相隔离：

## 1. 已上线的婚礼展示网站（V5.1）

**当前正式访问地址：**
https://raynacocobobobo-arch.github.io/DND/wedding/

- 根目录 index.html 与 images/ 保留现有静态页面、9类婚礼封面及品牌 Logo。
- 实际发布渠道为 DND 仓库的 gh-pages 分支，wedding/ 独立路径。
- 本仓库自己的 GitHub Pages 尚未成功启用，因此这里不要把 https://raynacocobobobo-arch.github.io/wedding/ 误认为当前在线地址。
- 静态前台不会被以下可移植后台项目覆盖。

## 2. 可完整移植的婚礼作品管理系统（新增）

**进入：[portable/README.md](portable/README.md)**

portable/ 是可以独立部署的完整版项目，包括：

- 自适应婚礼作品前台，按9种风格筛选；
- 管理员登录与后台页面；
- 新增、编辑、删除婚礼作品及草稿/发布功能；
- 每场作品1张一级主封面及多张二级细节图；
- 批量上传、拖动排序、删除和大图浏览；
- Node.js 22+ 上传接口、本地持久化图片存储、迁移/备份说明；
- Docker/Compose 运行配置与自动化 API 测试。

**重要说明：** 代码全部在 GitHub，可以完整克隆并自行部署；但是 GitHub Pages 不能运行 Node.js 上传接口。必须在本机、腾讯云或其他支持 Node.js 的服务器启动 portable 服务，才有真正可写的后台。首次运行会预置9张现有封面，不需要重新上传素材。管理密码及上传后的图片不会写入公开仓库。

## 授权

本仓库里的婚礼图片和品牌标志为项目所有者的素材，不应因仓库公开就推定它们可供第三方商用。
