# 🚀 Cloudflare Workers 一键部署指南

**适合小白快速部署！无需复杂配置。**

## ⚡ 30 秒快速开始

### 1️⃣ 克隆仓库
```bash
git clone https://github.com/szfp8/claude.git
cd claude
```

### 2️⃣ 安装依赖
```bash
npm install
```

### 3️⃣ 配置 Cloudflare
在 `wrangler.toml` 中修改：
```toml
name = "my-app"  # 改成你的应用名
```

### 4️⃣ 一键部署
```bash
npm run deploy
```

✅ **完成！** 你的应用现已在 Cloudflare Workers 上运行！

---

## 📋 必要配置

### 步骤 1: 登录 Cloudflare

```bash
npx wrangler login
```

会打开浏览器，点击授权即可。

### 步骤 2: 验证配置

```bash
npm run check:deployment
```

输出应该显示：
```
✅ 配置检查通过
✅ 数据库已初始化
✅ 可以开始部署
```

### 步骤 3: 部署

```bash
npm run deploy
```

完成后会显示：
```
✅ Deployed to https://my-app.workers.dev
```

---

## 🔑 环境变量配置（可选）

在 Cloudflare Dashboard 中配置：

```
JWT_SECRET = "your-secret-key"  # 建议生成随机字符串
SETUP_TOKEN = "your-setup-token"  # 首次初始化令牌
```

生成随机密钥：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## ✅ 验证部署成功

访问你的应用：
```
https://your-app-name.workers.dev/admin
```

看到初始化页面 = 部署成功！

---

## 🆘 常见问题

### Q: 部署失败？
```bash
npm run check:deployment  # 检查问题
npm run deploy            # 重新部署
```

### Q: 找不到 wrangler？
```bash
npm install wrangler --save-dev
```

### Q: 需要访问数据库？
```bash
npm run db:migrate:remote  # 初始化数据库
```

---

## 📞 需要帮助？

- 📖 [完整文档](./docs/DEPLOYMENT.md)
- 🐛 [提交 Issue](https://github.com/szfp8/claude/issues)
- 💬 [GitHub 讨论](https://github.com/szfp8/claude/discussions)

---

## 🎯 部署流程图

```
1. git clone
   ↓
2. npm install
   ↓
3. npx wrangler login
   ↓
4. npm run check:deployment
   ↓
5. npm run deploy
   ↓
✅ 成功！应用已上线
```

---

**祝部署顺利！🎉**
