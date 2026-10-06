# US · 设计定稿（V1）

> US 是"一段关系的数字形态"：属于这段关系，而不属于任何一个人。
> 核心循环：**注意到 → 在现实里去做 → 记住**。成功的标准是大家离开 App，一起做了真实的事。

## 不可妥协的原则

1. 爱不记分：不做分数、百分比、连续天数、等级、徽章、已读、在线状态、"最近活跃"，也不统计谁贡献得多。
2. 现实优先：没有信息流，没有无限滚动；每周最多一条通知，且必须用户主动开启；对方没回应时不会追着提醒。
3. 默认私密，只能邀请进入：没有搜索、发现页和公开主页。
4. US 属于所有成员，没有 owner。
5. 任何人随时可以独自离开，不需要任何人同意。
6. V1 没有 AI。

## 已确认的决定（2026-10-06）

| # | 问题 | 决定 |
|---|---|---|
| 1 | 有成员在中国大陆吗 | **有**。前端放 Cloudflare Pages，绑定自定义域名；Supabase 通过 `deploy/supabase-proxy` 的 Worker 反向代理到自己的域名；不使用 Google Fonts 等境外 CDN |
| 2 | 登录方式 | 邮箱 **6 位验证码**（同一封邮件里不放可点的链接），避免 iOS 主屏幕 PWA 和 Safari 不共享登录状态的问题 |
| 3 | 能否移除他人 | V1 **不能**，只能自己离开。测试里的"被移除的成员"即"已离开的成员" |
| 4 | 访客权限 | 访客是那个 US 的**完整成员**，提议也算一票；界面温和地建议绑定邮箱 |
| 5 | Quiet / 重新开启 | 进入安静、合上、重新开启都需要**全员同意**。已合上的 US 只能提议"重新开启"。离开（以及带走自己的内容）在合上状态下依然可以 |
| 6 | 揭晓前的提示 | **完全不提示**别人是否写了 |
| 7 | 私密想做的事完成后 | 两个选择：存为我们的回忆，或只在这件事上留一句给自己的话。intention 到 memory 的关联只存在私密的 intention 上 |
| 8 | 带走内容，但回忆下有别人的版本 | 删除我的正文和媒体，保留空壳和别人的版本 |
| 9 | 每周问题 | **每个人不同**：按 (ISO 周数 + 用户 id 的哈希) 从题库中取，每周轮换 |

## 数据模型

已实现（阶段 a）：

- `profiles`(id, display_name)
- `us_spaces`(name, description, preset_label, stage, state)，**没有 owner 列**
- `us_members`(us_id, user_id, joined_at, left_at, left_mode)
- `my_us_prefs`(user_id, us_id, sort_order, hidden)：只有本人可读
- `invitations`(us_id, token_hash, expires_at, used_at, revoked_at)：只存 token 的 sha256
- `proposals`(kind: rename|relabel|stage|state, payload, status) 和 `proposal_responses`：成员只能看到自己的回应
- `relationship_history`(from_stage, to_stage, happened_on)

后续阶段：`memories`、`memory_media`(b)；`perspectives`、`reveal_states`、`seen_notes`、`seen_note_keeps`(c)；`prompts`、`intentions`(d)；`push_subscriptions` 与导出(e)。

## RLS 策略

- `private.is_active_member(us_id)`（security definer）是所有策略的核心：只有**当前**成员（`left_at is null`）才能读写。
- `private.us_is_open(us_id)`：合上的 US 拒绝任何新增或修改。
- 结构性变化（建立、加入、离开、提议、改描述、邀请）只能通过 `public.*` 的 security-definer RPC 完成，这些表没有直接的 INSERT/UPDATE/DELETE 权限。
- 列级权限：`invitations.token_hash` 不可读；`profiles` 只能改 `display_name`；`my_us_prefs` 只能改 `sort_order`、`hidden`。
- 视图一律 `security_invoker = true`。
- `anon` 角色（未登录）对所有表都没有权限，只能调用 `invitation_preview(token)`。
- 测试：`supabase/tests/*.test.sql`（pgTAP），覆盖非成员、已离开成员、其他 US 的访客、未登录者。

## 页面

登录 · 起名 · 我的人（首页）· 新建 US · US 主页 · 关于我们（描述、邀请、提议、关系历程、收起、离开）· 离开流程 · 邀请落地页 · 我
后续：回忆详情/编辑、我的版本、我看见的你、收藏夹、想做的事、做到了、时间线、导出、每周提醒设置。
