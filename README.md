# 職促文小工具

104 網址清理＋職稱查詢＋方塊式貼文成效追蹤。

## 本機開發

```bash
npm install
npm run dev        # 前端（注意：/api 查職稱功能需要用 vercel dev 才會動）
```

若要連 `/api/job-title` 一起在本機測試：

```bash
npm i -g vercel
vercel dev
```

## 部署到 Vercel

### 方法一：拖拉上傳（最簡單，不用 Git）

1. 到 https://vercel.com 註冊／登入
2. 首頁按「Add New… → Project」
3. 把整個專案資料夾拖進去（或用 Vercel CLI：`npx vercel`）
4. Framework 會自動偵測為 **Vite**，直接按 Deploy

### 方法二：接 GitHub（之後改版會自動重新部署）

1. 把這個資料夾推上 GitHub
2. Vercel → Add New → Project → 選這個 repo → Deploy

不需要任何環境變數。

## 專案結構

```
├── api/job-title.js   # Vercel serverless function：抓 104 頁面標題解析職稱
├── App.jsx            # 主程式
├── main.jsx           # React 進入點
├── index.css          # Tailwind CSS
├── index.html
├── vite.config.js
└── package.json
```

## 與 Claude 版本的差異

- 資料改存瀏覽器 **localStorage**（只存在使用者自己的瀏覽器；換電腦或清除瀏覽資料就沒了，記得定期匯出 CSV 備份）
- 「查職稱」改由 `/api/job-title` serverless function 直接抓 104 頁面的 `<title>` 解析，不需要 AI API key
