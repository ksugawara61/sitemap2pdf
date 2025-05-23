# sitemap2pdf

## Flow

1. input に sitemap.xml のURLを受け取る
2. pupeteer で 1ページごとスクレイピング
3. @mizchi/readability で markdown に変換
4. ページごとに markdown ファイルを docs 配下に保存
5. 出力した markdown ファイルを pdf ファイルに変換
