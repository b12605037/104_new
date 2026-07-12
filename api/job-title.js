// Vercel Serverless Function：查詢 104 職缺名稱
// 部署後路徑為 /api/job-title?url=<104職缺網址>
// 原理：由伺服器端抓取該頁 HTML，解析 <title>「職缺名稱｜公司名稱｜104求職」

export default async function handler(req, res) {
  const raw = req.query.url;
  if (!raw) {
    return res.status(400).json({ error: "缺少 url 參數" });
  }

  let u;
  try {
    u = new URL(raw);
  } catch {
    return res.status(400).json({ error: "無效的網址" });
  }

  // 只允許 104 的網址，避免被當成任意網頁代理
  if (!/(^|\.)104\.com(\.tw)?$/.test(u.hostname)) {
    return res.status(400).json({ error: "只支援 104 的網址" });
  }

  try {
    const r = await fetch(u.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "zh-TW,zh;q=0.9",
      },
      redirect: "follow",
    });

    if (!r.ok) {
      return res.status(200).json({ jobTitle: null, company: null });
    }

    const html = await r.text();

    // 1) 先試 og:title，再退回 <title>
    const og = html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
    );
    const titleTag = html.match(/<title>([^<]*)<\/title>/i);
    const title = (og?.[1] || titleTag?.[1] || "").trim();

    if (!title) {
      return res.status(200).json({ jobTitle: null, company: null });
    }

    // 104 標題格式通常是「職缺名稱｜公司名稱｜104求職」
    const parts = title.split(/[｜|]/).map((s) => s.trim()).filter(Boolean);
    const cleaned = parts.filter((p) => !/104/.test(p));

    const jobTitle = cleaned[0] || null;
    const company = cleaned[1] || null;

    // 快取一天，同一個職缺不用重抓
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate");
    return res.status(200).json({ jobTitle, company });
  } catch (e) {
    return res.status(200).json({ jobTitle: null, company: null, error: String(e?.message || e) });
  }
}
