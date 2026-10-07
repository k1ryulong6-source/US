# 部署与测试指南

V1 的全部功能都已完成：登录、US、邀请、提议、回忆（照片和声音）、各自的版本、我看见的你、每周问题、想做的事、时间线、离开、导出、PWA，以及可选的每周提醒。

---

## 先试用：不买域名（只有你自己和一位朋友）

适合先在自己手机上试。`*.pages.dev` 和 `*.supabase.co` 在大陆经常打不开，所以这种方式只在国外、或者开着代理时可用；确定要给大陆的朋友用，再按后面的完整步骤买域名。

1. **Supabase**：新建项目（Region 选 Tokyo）。
   - SQL Editor → New query → 粘贴全部 11 个迁移文件的内容（按文件名顺序；或运行 `scripts/db/combine.sh > all.sql` 得到一个合并好的文件）→ Run。只在新项目里运行一次。
   - Authentication → Sign In / Providers：Email 开启、关闭 "Confirm email"、OTP 长度 6；打开 **Allow anonymous sign-ins**。
   - Authentication → Emails → Templates：Magic Link、Confirm signup 换成 `supabase/templates/` 里对应的模板（邮件里才会有 6 位验证码）。
   - 不需要 SMTP：自带的发信服务能发给**你自己**（项目成员）的邮箱；朋友用邀请链接以访客身份进来，不需要邮箱。
2. **Cloudflare Pages**：Workers & Pages → Create → Pages → Connect to Git，选这个仓库。
   - Production branch 选代码所在的分支；Build command `npm run build`；Build output `dist`。
   - 环境变量：`VITE_SUPABASE_URL` = Project URL，`VITE_SUPABASE_ANON_KEY` = publishable（anon）key，`NODE_VERSION` = `22`。
   - 部署完会得到 `https://<名字>.pages.dev`。
3. 回到 Supabase → Authentication → URL Configuration，Site URL 填这个 `pages.dev` 地址。
4. 手机打开这个地址：用自己的邮箱登录 → 新建 US → 在 About 里生成邀请链接发给朋友。
5. 防止免费版暂停（推荐）：Supabase 免费项目一周没人访问会自动暂停。仓库里有一个每天访问一次数据库的定时任务（`.github/workflows/keep-alive.yml`）。在 GitHub → 仓库 Settings → Secrets and variables → Actions 里添加两个 secret：`SUPABASE_URL`（Project URL）和 `SUPABASE_ANON_KEY`（anon key，**不是** service_role key）。注意：定时任务只在默认分支（main）上运行，代码合并到 main 之后才会生效。

---

## 0. 你需要准备

- 一个域名（例如 `example.com`），托管在 Cloudflare（免费套餐即可）。大陆成员访问 `*.pages.dev` 和 `*.supabase.co` 都不稳定，所以前端和 API 都需要走你自己的域名。
- Supabase 账号和 Cloudflare 账号。
- 一个能发信的 SMTP 服务（推荐 [Resend](https://resend.com)，免费额度足够 20 个人用，需要在它那里验证你的域名）。

## 1. 创建 Supabase 项目

1. 新建项目，Region 选 **Northeast Asia (Tokyo)**。
2. 建表：把 `supabase/migrations/` 里的 11 个 SQL 文件**按文件名顺序**（或 `scripts/db/combine.sh` 合并出的一个文件）粘贴到 **SQL Editor** 执行。这一步会自动建好私有的 `media` 存储桶和题库。
   也可以用 CLI：
   ```bash
   npx supabase login
   npx supabase link --project-ref <你的 project ref>
   npx supabase db push
   ```
3. **Authentication → Sign In / Providers**
   - Email：开启，**关闭 "Confirm email"**（用验证码登录本身就是确认），Email OTP Length 设为 **6**。
   - 打开 **Allow anonymous sign-ins**（访客通过链接进入需要它）。
4. **Authentication → Emails → Templates**：把仓库里的模板内容复制进去，主题都可以写成"你的 US 验证码"。
   - Magic Link ← `supabase/templates/magic_link.html`
   - Confirm signup ← `supabase/templates/confirmation.html`
   - Change Email Address ← `supabase/templates/email_change.html`
5. **Authentication → Emails → SMTP Settings**：填入 Resend 的 SMTP 信息。
   ⚠️ Supabase 自带的发信服务**只会发给项目团队成员的邮箱**，而且每小时只能发几封，不配置自己的 SMTP，其他人收不到验证码。
6. **Authentication → URL Configuration**：Site URL 填 `https://us.example.com`（第 3 步的前端域名）。
7. **Project Settings → API Keys**：记下 Project URL 和 publishable key（或旧版的 anon key）。

## 2. 给大陆成员的 API 代理（Cloudflare Worker）

1. 编辑 `deploy/supabase-proxy/wrangler.toml`：把 `api.example.com` 换成你的子域名，`SUPABASE_URL` 换成你的 Project URL。
2. 部署：
   ```bash
   npx wrangler login
   npx wrangler deploy --config deploy/supabase-proxy/wrangler.toml
   ```
3. 验证：浏览器打开 `https://api.example.com/auth/v1/health`，应该看到一段 JSON（提示缺少 apikey 也说明代理已经通了）。

> Cloudflare 在大陆通常可以访问，但不保证速度。如果以后明显变慢，可以换成一台香港或日本的小 VPS，用 nginx 做同样的反向代理，前端不需要改代码。

## 3. 部署前端（Cloudflare Pages）

1. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git**，选这个仓库。
2. Build command 填 `npm run build`，Build output 填 `dist`。
3. 环境变量：
   - `VITE_SUPABASE_URL` = `https://api.example.com`（走代理；如果没有大陆成员，直接填 Project URL）
   - `VITE_SUPABASE_ANON_KEY` = 你的 publishable key
   - `VITE_VAPID_PUBLIC_KEY` = 见第 4 步；不需要每周提醒就留空，设置页里不会出现这一项
   - `NODE_VERSION` = `22`
4. **Custom domains** → 添加 `us.example.com`。

## 4. 每周提醒（可选）

不做这一步，App 也能完整使用。

1. 生成一对 VAPID 密钥：`npx web-push generate-vapid-keys`
2. 部署 Edge Function，并设置它的密钥：
   ```bash
   npx supabase functions deploy weekly-reminder --no-verify-jwt
   npx supabase secrets set CRON_SECRET=<随便一串长随机字符> \
     VAPID_PUBLIC_KEY=<公钥> VAPID_PRIVATE_KEY=<私钥> VAPID_SUBJECT=mailto:<你的邮箱>
   ```
3. 打开 `supabase/sql/schedule-weekly-reminder.sql`，替换里面的 Project URL 和 CRON_SECRET，然后在 SQL Editor 里执行一次。它会每小时检查一次谁到了自己设定的提醒时间；每个人每周最多收到一条。
4. 把公钥填进 Cloudflare Pages 的 `VITE_VAPID_PUBLIC_KEY`，然后重新部署。

说明：iPhone 需要先"添加到主屏幕"才能收到提醒。安卓 Chrome 的推送依赖 Google 的服务，**在大陆通常收不到**。

## 5. 在手机上测试

准备两部手机，或者一部手机加一台电脑的无痕窗口。下面称 A 和 B。

**登录和 US**
1. A 打开 `https://us.example.com`，输入邮箱，收到 6 位验证码后登录，再给自己起个名字。
2. A 新建一个 US：填名字、描述，选一个标签，写上阶段"朋友"和一个过去的日期。
3. A 在"关于我们"里生成邀请链接，用微信发给 B。B 打开链接，写个称呼，点"进来吧"，不需要注册。
4. B 再点一次同一个链接，会直接回到这个 US。把链接转给第三个人，对方会看到"已经用过"。

**每周问题和想做的事**
5. A 的首页顶部有"这周的问题"。点进去，写一件事，选"我们一起"。
6. A 在 US 页面再写一件事，保持默认的"只有我知道"。B 那边**完全看不到**这件事。
7. B 在"想做的事"里把那件"我们一起"的事标记为做到了，选"存为我们的回忆"，写几句话、加一张照片。
8. A 把自己那件私密的事标记为做到了，选"只留一句给自己"。

**回忆和各自的版本**
9. A 留下一段过去的回忆：日期选去年，精度选"只记得哪个月"，加照片、录一段声音、写地点。
10. B 打开这段回忆：先看到"你记得的版本是？"，看不到任何别人写的东西。B 写下自己的版本，也可以录一段声音。
11. A 再打开同一段回忆：同样看不到 B 写了什么。点"跳过，直接看"之后，才能看到 B 的版本。
12. B 把自己的版本改成"只给自己看"，A 刷新后就看不到了。

**我看见的你**
13. A 在 US 页面点"我看见的你"，给 B 写一张纸条。B 能看到，并可以点"收好"；在"我 → 收好的「我看见的你」"里能找到它。A 不会知道 B 有没有收好。

**时间线、提议和状态**
14. US 页面的时间线按年份从新到旧排列：回忆、一起做到的事、关系阶段的变化。
15. A 提议把阶段改成"恋人"，B 同意后，时间线里会多一条阶段变化。
16. 提议"安静一阵子"或"合上"，需要两个人都同意。合上之后不能再添新内容，过去的一切都还在。

**离开、导出和安装**
17. B："我 → 导出我的数据"，会下载一个 ZIP，里面有 data.json、照片和声音文件。
18. B 离开这个 US，选"带走我的内容"。A 那边：B 写的回忆和版本都消失了；如果 A 在 B 的某段回忆下写过版本，这段回忆会以空壳的形式保留，A 写的不受影响。
19. 安装：iPhone 在 Safari 里点"分享 → 添加到主屏幕"；安卓 Chrome 菜单里选"安装应用"。之后可以在"我"里打开每周提醒。

iOS 小提示：主屏幕上的 App 和 Safari 是**两个独立的存储**。在 Safari 里以访客身份进来的人，到 Me →「换到另一台设备」生成一个换设备码，再在主屏幕 App 的登录页点「我有换设备码」输入，就能接着用同一个身份（不需要邮箱）。换手机也是这样。

## 6. 运行测试

数据库权限测试共 265 条：

```bash
npx supabase start
npx supabase test db
```

没有 Docker、只有本机 Postgres + pgTAP 时：

```bash
PGHOST=... PGPORT=... PGUSER=postgres npm run test:db:local
```

整条使用流程的端到端测试（Playwright，手机尺寸，只连本地，会清空本地数据库）见 [`e2e/README.md`](../e2e/README.md)：

```bash
cd e2e && npm install && npm test
```

## 7. 本地开发

```bash
cp .env.example .env.local    # 本地开发填 http://127.0.0.1:54321 和 supabase start 输出的 publishable key
npx supabase start            # 本地的验证码邮件在 http://127.0.0.1:54324 查看
npm install
npm run dev                   # 手机和电脑在同一 Wi-Fi 下，可以用电脑的局域网 IP:5173 访问
```
