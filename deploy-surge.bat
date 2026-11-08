#!/usr/bin/env bash
# =====================================================================
# surge.sh にフロントエンド(frontend/)を公開するスクリプト
#   公開先: https://nexus-vortx.surge.sh （固定）
#
#   使い方:   ./deploy-surge.sh
#
#   ・初回だけ、メールアドレスとパスワードでアカウントを作ります(surge が聞いてくれます)
#   ・Node.js(npm)が入っていれば、surge のインストールは不要です(npx で動かします)
#   ・frontend/ は書き換えません。公開用のコピーを .surge-dist/ に作って、それをアップします
#     (CNAME ファイルを frontend/ に置くと、GitHub Pages が「独自ドメイン」と勘違いして壊れるため)
#   ・DRY_RUN=1 ./deploy-surge.sh  → アップせずに、公開用のコピーだけ作って中身を確認できます
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")"

SRC="frontend"
DIST=".surge-dist"
DOMAIN="nexus-vortx.surge.sh"   # 公開ドメイン（固定。変えたいときはここを書き換え）

[ -f "$SRC/index.html" ] || { echo "$SRC/index.html が見つかりません。リポジトリの一番上のフォルダで実行してください。" >&2; exit 1; }
[ -f "$SRC/v43.js" ] || echo "⚠ $SRC/v43.js がありません。古いバージョンのファイルかもしれません。" >&2

# 公開用のコピーを作る
rm -rf "$DIST"; mkdir -p "$DIST"
cp -R "$SRC"/. "$DIST"/
rm -f "$DIST/CNAME"
echo "$DOMAIN" > "$DIST/CNAME"          # surge は CNAME ファイルでドメインを決める
cp "$DIST/index.html" "$DIST/200.html"  # 知らないURLに来ても、アプリを開く(surge の仕様)
cp "$DIST/index.html" "$DIST/404.html"

VER="$(grep -o 'Ver\. [0-9.]*' "$DIST/index.html" | head -1 || true)"
echo "公開するもの: $SRC/ のコピー($(find "$DIST" -type f | wc -l | tr -d ' ') ファイル / ${VER:-バージョン不明})"
echo "公開先:       https://$DOMAIN"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN=1 なので、アップはしません。中身は $DIST/ を見てください。"
  exit 0
fi

if ! command -v npx >/dev/null 2>&1 && ! command -v surge >/dev/null 2>&1; then
  echo "Node.js が見つかりません。https://nodejs.org から入れてください(npm が付いてきます)。" >&2
  exit 1
fi

if command -v surge >/dev/null 2>&1; then
  surge "$DIST" "$DOMAIN"
else
  npx --yes surge "$DIST" "$DOMAIN"
fi
echo
echo "✅ 公開しました → https://$DOMAIN"
echo "   ※ バックエンド(Render)の環境変数 ALLOWED_ORIGINS に https://$DOMAIN を入れてください(未設定なら不要)"
