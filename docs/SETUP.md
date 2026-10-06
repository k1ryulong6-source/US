# 部署与测试指南

按阶段累积更新。目前完成到：**阶段 (a)**，包括登录、US、成员、邀请、提议和 RLS 测试。

---

## 0. 你需要准备

- 一个域名（例如 `example.com`），并托管在 Cloudflare（免费套餐即可）。大陆成员访问 `*.pages.dev` 和 `*.supabase.co` 都不稳定，所以前端和 API 都需要走你自己的域名。
- Supabase 账号，以及 Cloudflare 账号。
- 一个能发信的 SMTP 服务（推荐 [Resend](https://resend.com)，免费额度足够 20 个人用，需要在它那里验证你的域名）。

## 1. 创建 Supabase 项目

1. 新建项目，Region 选 **Northeast Asia (Tokyo)**。
2. 建表：把 `supabase/migrations/` 里的 SQL **按文件名顺序**粘贴到 **SQL Editor** 执行。
   你也可以用 CLI：
   ```bash
   npx supabase login
   npx supabase link --project-ref <你的 project ref>
   npx supabase db push
   ```
3. **Authentication → Sign In / Providers**
   - Email：开启，**关闭 "Confirm email"**（用验证码登录本身就是确认），Email OTP Length 设为 **6**。
   - 打开 **Allow anonymous sign-ins**（访客通过链接进入需要它）。
4. **Authentication → Emails → Templates**：把仓库里的模板内容复制进去。
   - Magic Link ← `supabase/templates/magic_link.html`
   - Confirm signup ← `supabase/templates/confirmation.html`
   - Change Email Address ← `supabase/templates/email_change.html`
   - 主题可以都写成"你的 US 验证码"。
5. **Authentication → Emails → SMTP Settings**：填入 Resend 的 SMTP 信息。
   ⚠️ Supabase 自带的发信服务**只会发给项目团队成员的邮箱**，而且每小时只能发几封，不配置自己的 SMTP，其他人收不到验证码。
6. **Authentication → Rate Limits**：把匿名登录的限制保持在每小时 30 次左右即可。
7. **Authentication → URL Configuration**：Site URL 填 `https://us.example.com`（下面第 3 步的前端域名）。
8. **Project Settings → API Keys**：记下 Project URL，以及 publishable key（或旧版的 anon key）。

## 2. 给大陆成员的 API 代理（Cloudflare Worker）

1. 编辑 `deploy/supabase-proxy/wrangler.toml`：把 `api.example.com` 换成你的子域名，`SUPABASE_URL` 换成你的 Project URL。
2. 部署：
   ```bash
   npx wrangler login
   npx wrangler deploy --config deploy/supabase-proxy/wrangler.toml
   ```
3. 验证：浏览器打开 `https://api.example.com/auth/v1/health`，应该看到一段 JSON（可能提示缺少 apikey，这也说明代理已经通了）。

> 说明：Cloudflare 在大陆通常可以访问，但不保证速度。如果以后发现明显变慢，可以换成一台香港或日本的小 VPS，用 nginx 做同样的反向代理，前端不需要改代码。

## 3. 部署前端（Cloudflare Pages）

1. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git**，选这个仓库。
2. Build command：`npm run build`，Build output：`dist`。
3. 环境变量：
   - `VITE_SUPABASE_URL` = `https://api.example.com`（走代理；如果没有大陆成员，直接填 Project URL）
   - `VITE_SUPABASE_ANON_KEY` = 你的 publishable key
   - `NODE_VERSION` = `22`
4. **Custom domains** → 添加 `us.example.com`。
5. 回到 Supabase，确认 Site URL 和这个域名一致。

## 4. 在手机上测试（阶段 a）

准备两部手机，或者一部手机加一台电脑的无痕窗口。

1. **手机 A**：打开 `https://us.example.com` → 输入邮箱 → 收到 6 位验证码（如果没看到，看看垃圾邮件）→ 输入后给自己起个名字。
2. 点"新建一个 US"：写名字、描述，可选一个标签和阶段 → 建好后自动进入"关于我们"。
3. 点"生成一个邀请链接" → 通过微信或短信发给手机 B。
4. **手机 B**：打开链接 → 看到「US 名字」和"小林 在这里等你" → 写一个称呼 → 点"进来吧"，不需要注册。
5. 手机 B 再点一次同一个链接：会直接回到这个 US。把链接转发给第三个人：对方会看到"这个链接已经用过"。
6. **手机 A**：关于我们 → 提一个建议 → 改名。名字暂时不会变。
7. **手机 B**：US 页面出现"有一个提议，等你看看。" → 同意 → 两边刷新后都显示新名字。
8. 手机 A：从我的视野里收起 → 首页出现"收起来的（1）"；手机 B 的首页不受影响。
9. 手机 B：我 → 绑定邮箱 → 输入验证码。之后用这个邮箱，在任何设备上都能找回这个身份。
10. 试试离开：关于我们 → 离开这个 US → 选一种方式 → 确定。对方只会看到成员少了一个人。

iOS 小提示：访客身份存在当前浏览器里。从 Safari "添加到主屏幕"以后，主屏幕 App 和 Safari 是**两个独立的存储**，所以访客最好先在"我"里绑定邮箱，再到主屏幕 App 里用邮箱登录。

## 5. 运行安全测试

需要 Docker：
```bash
npx supabase start
npx supabase test db
```

没有 Docker、只有本机 Postgres + pgTAP 时：
```bash
PGHOST=... PGPORT=... PGUSER=postgres npm run test:db:local
```

## 6. 本地开发

```bash
cp .env.example .env.local    # 本地开发填 http://127.0.0.1:54321 和 supabase start 输出的 publishable key
npx supabase start            # 本地验证码邮件在 http://127.0.0.1:54324 查看
npm install
npm run dev                   # 手机和电脑在同一 Wi-Fi 下，可以用电脑的局域网 IP:5173 访问
```
