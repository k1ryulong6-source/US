#!/usr/bin/env bash
# Prints every migration in order as one SQL file, for pasting into the Supabase SQL Editor
# of a brand-new project:  scripts/db/combine.sh > all.sql
set -euo pipefail
cd "$(dirname "$0")/../../supabase/migrations"
files=(*.sql)
echo "-- US：一次性建好全部数据库结构（按顺序合并了 supabase/migrations/ 里的 ${#files[@]} 个文件）"
echo "-- 用法：Supabase → SQL Editor → New query → 全部粘贴 → Run。只在一个全新的项目里运行一次。"
for f in "${files[@]}"; do
  printf '\n-- ===================================================== %s\n' "$f"
  cat "$f"
done
