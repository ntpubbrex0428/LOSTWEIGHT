Lost Weight v17.5 最終實用版（已修正）

這包已整理成可直接 Firebase Hosting 部署版，並加入 PWA 安裝支援。

已修正：
- Email/Password 註冊 / 登入 / 忘記密碼 import 缺漏
- 暱稱儲存函式缺漏
- 歷史紀錄 async 語法錯誤
- 趨勢圖重複函式 / 錯誤 canvas id
- 未登入時只顯示登入頁
- 登入後才顯示首頁 / 照片 / 社群 / 底部導覽
- 手機版超框與表格擠爆問題
- 網站品牌統一為 Lost Weight
- PWA manifest / service worker / icon / favicon

Firebase 後台要先開：
1. Authentication -> Sign-in method -> Email/Password -> 啟用
2. Realtime Database -> 建立資料庫

部署：
npm install -g firebase-tools
firebase login
cd 這個資料夾
firebase deploy --only hosting

成功後用：
https://lose-weight-3ae05.web.app
或
https://lose-weight-3ae05.firebaseapp.com

PWA：
部署後可用 iPhone Safari -> 分享 -> 加入主畫面
Android / Chrome 可直接安裝


v17.8 新增：
- 右下角聊天室
- 社群照片牆每人獨立左右滑動
- 照片刪除
- BMI 狀態文字與顏色
- 不同 BMI / 體重的飲食建議
- AI 食物辨識前端 + Netlify Function 後端

AI 食物辨識設定：
1. 在 Netlify 專案設定 -> Environment variables
2. 新增 OPENAI_API_KEY
3. 重新 Deploy

注意：
- 不要把 API key 寫進 index.html
- AI 辨識走 /.netlify/functions/food-analyze
