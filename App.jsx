import { useState, useEffect, useRef } from "react";

// ---------- 小工具函式 ----------

// 清理 104 網址：移除 jobsource 參數
function cleanUrl104(raw) {
  const input = raw.trim();
  if (!input) return { ok: false, error: "" };
  let u;
  try {
    u = new URL(input);
  } catch {
    return { ok: false, error: "這看起來不是有效的網址，請確認是否完整（含 https://）。" };
  }
  if (!u.hostname.includes("104.com")) {
    return { ok: false, error: "這不是 104 的網址喔。" };
  }
  u.searchParams.delete("jobsource");
  let result = u.toString();
  if (result.endsWith("?")) result = result.slice(0, -1);
  return { ok: true, url: result };
}

// 各 Medium 對應的追蹤參數
const MEDIUM_TRACKING = {
  "雅婷理組帳號": { jobsource: "threads_yting", utm_source: "threads", utm_medium: "yting" },
  "雅婷文組帳號": { jobsource: "threads_yting01", utm_source: "threads", utm_medium: "yting01" },
};

// 依照方塊選的 Medium 與建立日期產生追蹤連結，格式：
// ?jobsource=threads_yting01&utm_source=threads&utm_medium=yting01&utm_campaign=20260626
function buildTrackedUrl(cleanUrl, medium, publishDate) {
  const t = MEDIUM_TRACKING[medium];
  if (!t) return null;
  try {
    const u = new URL(cleanUrl);
    u.searchParams.set("jobsource", t.jobsource);
    u.searchParams.set("utm_source", t.utm_source);
    u.searchParams.set("utm_medium", t.utm_medium);
    const campaign = String(publishDate || "").replace(/-/g, "");
    if (campaign) u.searchParams.set("utm_campaign", campaign);
    return u.toString();
  } catch {
    return null;
  }
}

// 複製到剪貼簿（含 fallback）
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

// ---------- 本機儲存（localStorage） ----------
const STORAGE_KEY = "jpt:posts";

function loadPosts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePosts(posts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    return true;
  } catch {
    return false;
  }
}

// 今天的日期（本地時區，YYYY-MM-DD）
function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const emptyPostFields = {
  post_name: "",
  theme: "",
  format: "",
  medium: "",
  reach: "",
  likes: "",
  shares: "",
  comments: "",
  link_clicks: "",
  fans_gained: "",
  note: "",
};

const num = (v) => {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
};

function calcCTR(row) {
  const reach = num(row.reach);
  const clicks = num(row.link_clicks);
  if (reach <= 0) return null;
  return (clicks / reach) * 100;
}

// 舊資料（單列式）轉成新的方塊格式
function migrate(rows) {
  return rows.map((r) => ({
    _id: r._id || uid(),
    publish_date: r.publish_date || todayStr(),
    ...emptyPostFields,
    ...r,
    links: Array.isArray(r.links) ? r.links : [],
  }));
}

// ---------- 下拉選單選項 ----------
const OPT_KEY = "jpt:options";

const defaultOptions = {
  theme: ["一般職促文"],
  format: ["文字", "圖片"],
  medium: ["雅婷理組帳號", "雅婷文組帳號"],
};

function loadOptions() {
  try {
    const raw = localStorage.getItem(OPT_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    // 預設選項在前，之後自己新增的接在後面（去重）
    const merged = {};
    for (const k of Object.keys(defaultOptions)) {
      const extra = Array.isArray(saved[k]) ? saved[k] : [];
      merged[k] = [...new Set([...defaultOptions[k], ...extra])];
    }
    return merged;
  } catch {
    return { ...defaultOptions };
  }
}

function saveOptions(opts) {
  try {
    localStorage.setItem(OPT_KEY, JSON.stringify(opts));
  } catch {
    // 存不進去就只保留在畫面上
  }
}

// 下拉選單欄位；傳入 onAddOption 時，選單最下面會多一個「＋ 新增選項…」
function SelectField({ label, value, options, onChange, onAddOption }) {
  const [adding, setAdding] = useState(false);
  const [newOpt, setNewOpt] = useState("");

  const inputCls =
    "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";
  const labelCls = "block text-xs font-medium text-stone-500 mb-1";

  // 舊資料的值若不在選項清單裡，也要能顯示出來
  const list = value && !options.includes(value) ? [value, ...options] : options;

  const confirmAdd = () => {
    const v = newOpt.trim();
    if (v) {
      if (!options.includes(v)) onAddOption(v);
      onChange(v);
    }
    setAdding(false);
    setNewOpt("");
  };

  return (
    <div>
      <label className={labelCls}>{label}</label>
      {!adding ? (
        <select
          className={inputCls}
          value={value}
          onChange={(e) => {
            if (e.target.value === "__add__") {
              setAdding(true);
            } else {
              onChange(e.target.value);
            }
          }}
        >
          <option value="">— 請選擇 —</option>
          {list.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          {onAddOption && <option value="__add__">＋ 新增選項…</option>}
        </select>
      ) : (
        <div className="flex gap-1">
          <input
            className={inputCls}
            autoFocus
            placeholder="輸入新選項名稱"
            value={newOpt}
            onChange={(e) => setNewOpt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmAdd();
              if (e.key === "Escape") {
                setAdding(false);
                setNewOpt("");
              }
            }}
          />
          <button
            className="shrink-0 rounded-md bg-indigo-600 px-2.5 text-sm font-medium text-white hover:bg-indigo-700"
            onClick={confirmAdd}
          >
            加入
          </button>
          <button
            className="shrink-0 rounded-md border border-stone-300 px-2.5 text-sm text-stone-500 hover:bg-stone-100"
            onClick={() => {
              setAdding(false);
              setNewOpt("");
            }}
          >
            取消
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- 貼文方塊 ----------
function PostCard({ post, index, onChange, onDelete, onAddLink, onDeleteLink, onCopy, copied, options, onAddOption }) {
  const [linkInput, setLinkInput] = useState("");
  const [linkErr, setLinkErr] = useState("");

  const inputCls =
    "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";
  const labelCls = "block text-xs font-medium text-stone-500 mb-1";
  const btnGhost =
    "rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  const set = (k, v) => onChange({ ...post, [k]: v });
  const ctr = calcCTR(post);

  const addLink = () => {
    const r = cleanUrl104(linkInput);
    if (!r.ok) {
      setLinkErr(r.error || "請先貼上網址。");
      return;
    }
    if (post.links.some((l) => l.url === r.url)) {
      setLinkErr("這個連結已經在這篇貼文裡了。");
      return;
    }
    setLinkErr("");
    setLinkInput("");
    onAddLink(post._id, { _id: uid(), url: r.url, title: "" });
  };

  const numFields = [
    { k: "reach", label: "reach" },
    { k: "likes", label: "likes" },
    { k: "shares", label: "shares" },
    { k: "comments", label: "comments" },
    { k: "link_clicks", label: "link_clicks" },
    { k: "fans_gained", label: "增加粉絲數量" },
  ];

  return (
    <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
      {/* 方塊標頭：自動編號 + 自動日期 */}
      <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-5 py-3">
        <span className="rounded-md bg-indigo-600 px-2.5 py-1 text-sm font-semibold text-white">
          post_id {index + 1}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-stone-500">publish_date</span>
          <input
            type="date"
            className="rounded-md border border-stone-300 px-2 py-1 text-sm text-stone-700"
            value={post.publish_date}
            onChange={(e) => set("publish_date", e.target.value)}
          />
          <span className="text-xs text-stone-400">（建立時自動帶入，可修改）</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-stone-400">
            {post.links.length} 個連結 · CTR{" "}
            <span className="font-medium text-indigo-700">
              {ctr === null ? "—" : ctr.toFixed(2) + "%"}
            </span>
          </span>
          <button
            className="text-xs text-red-500 hover:underline"
            onClick={() => onDelete(post._id)}
          >
            刪除方塊
          </button>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        {/* 基本欄位 */}
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-56">
            <label className={labelCls}>post_name（貼文名稱）</label>
            <input
              className={inputCls}
              value={post.post_name}
              onChange={(e) => set("post_name", e.target.value)}
            />
          </div>
          <div className="w-48">
            <SelectField
              label="theme（主題）"
              value={post.theme}
              options={options.theme}
              onChange={(v) => set("theme", v)}
              onAddOption={(v) => onAddOption("theme", v)}
            />
          </div>
          <div className="w-36">
            <SelectField
              label="format（形式）"
              value={post.format}
              options={options.format}
              onChange={(v) => set("format", v)}
            />
          </div>
          <div className="w-44">
            <SelectField
              label="Medium（媒介）"
              value={post.medium}
              options={options.medium}
              onChange={(v) => set("medium", v)}
            />
          </div>
        </div>

        {/* 數字欄位 */}
        <div className="flex flex-wrap gap-3">
          {numFields.map((f) => (
            <div key={f.k} className="w-28">
              <label className={labelCls}>{f.label}</label>
              <input
                type="number"
                min="0"
                className={inputCls}
                value={post[f.k]}
                onChange={(e) => set(f.k, e.target.value)}
              />
            </div>
          ))}
          {/* CTR 自動計算欄位：link_clicks / reach */}
          <div className="w-32">
            <label className={labelCls}>CTR（自動 = link_clicks / reach）</label>
            <div
              className="rounded-md border border-dashed border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700"
              title="CTR = link_clicks ÷ reach × 100%，填好兩個欄位就會自動算"
            >
              {ctr === null ? "—" : ctr.toFixed(2) + "%"}
            </div>
          </div>
        </div>

        {/* 文案 */}
        <div>
          <label className={labelCls}>文案</label>
          <textarea
            className={inputCls + " min-h-20 resize-y"}
            placeholder="貼上這篇貼文的文案內容"
            value={post.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </div>

        {/* 連結區 */}
        <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4">
          <label className={labelCls}>這篇貼文的 104 連結（可加多個，會自動清掉 jobsource）</label>
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="https://www.104.com.tw/job/xxxxx?jobsource=..."
              value={linkInput}
              onChange={(e) => {
                setLinkInput(e.target.value);
                setLinkErr("");
              }}
              onKeyDown={(e) => e.key === "Enter" && addLink()}
            />
            <button className={btnGhost + " shrink-0 bg-white"} onClick={addLink}>
              加入連結
            </button>
          </div>
          {linkErr && <p className="mt-2 text-sm text-red-600">{linkErr}</p>}

          {post.links.length > 0 && (
            <ul className="mt-3 space-y-2">
              {post.links.map((l) => (
                <li key={l._id} className="rounded-md border border-stone-200 bg-white px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-sm text-indigo-700 hover:underline"
                      title={l.url}
                    >
                      {l.url}
                    </a>
                    <button
                      className="shrink-0 text-xs text-stone-500 hover:text-stone-700"
                      onClick={() => onCopy(l.url, l._id)}
                    >
                      {copied === l._id ? "已複製 ✓" : "複製"}
                    </button>
                    <button
                      className="shrink-0 text-xs text-red-500 hover:underline"
                      onClick={() => onDeleteLink(post._id, l._id)}
                    >
                      移除
                    </button>
                  </div>
                  <input
                    className="mt-1.5 w-full rounded border border-stone-200 bg-stone-50 px-2 py-1 text-xs text-stone-600 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    placeholder="職缺名稱（手動輸入）"
                    value={l.title}
                    onChange={(e) =>
                      onChange({
                        ...post,
                        links: post.links.map((x) =>
                          x._id === l._id ? { ...x, title: e.target.value } : x
                        ),
                      })
                    }
                  />

                  {/* 追蹤連結：依這個方塊選的 Medium 自動掛上 jobsource / utm 參數 */}
                  {(() => {
                    const tracked = buildTrackedUrl(l.url, post.medium, post.publish_date);
                    if (tracked) {
                      return (
                        <div className="mt-1.5 flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5">
                          <span className="shrink-0 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            追蹤連結
                          </span>
                          <a
                            href={tracked}
                            target="_blank"
                            rel="noreferrer"
                            className="min-w-0 flex-1 truncate text-xs text-indigo-700 hover:underline"
                            title={tracked}
                          >
                            {tracked}
                          </a>
                          <button
                            className="shrink-0 text-xs font-medium text-indigo-700 hover:underline"
                            onClick={() => onCopy(tracked, l._id + "-t")}
                          >
                            {copied === l._id + "-t" ? "已複製 ✓" : "複製"}
                          </button>
                        </div>
                      );
                    }
                    return (
                      <p className="mt-1.5 text-xs text-stone-400">
                        先在上方選擇 Medium（媒介），就會自動產生這個帳號專用的追蹤連結。
                      </p>
                    );
                  })()}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- 主元件 ----------
export default function App() {
  const [tab, setTab] = useState("dashboard");

  const [copied, setCopied] = useState("");

  // --- 貼文方塊狀態 ---
  const [posts, setPosts] = useState([]);
  const [options, setOptions] = useState(defaultOptions);

  // 新增下拉選單選項（目前 theme 開放新增），並存進 localStorage
  const addOption = (kind, value) => {
    setOptions((prev) => {
      const next = { ...prev, [kind]: [...prev[kind], value] };
      saveOptions(next);
      return next;
    });
  };

  const [loaded, setLoaded] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const saveTimer = useRef(null);

  // 載入已儲存資料（含舊格式轉換）
  useEffect(() => {
    setPosts(migrate(loadPosts()));
    setOptions(loadOptions());
    setLoaded(true);
  }, []);

  // 儲存（去抖動，避免打字時狂寫入）
  const persist = (next) => {
    setPosts(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const ok = savePosts(next);
      if (!ok) {
        setSaveMsg("儲存失敗，資料只保留在目前畫面。");
        setTimeout(() => setSaveMsg(""), 3000);
      }
    }, 600);
  };

  // --- 方塊操作 ---
  const addPost = (extra = {}) => {
    const p = {
      _id: uid(),
      publish_date: todayStr(), // 自動帶入建立日期
      ...emptyPostFields,
      links: [],
      ...extra,
    };
    persist([...posts, p]);
    return p;
  };

  const updatePost = (next) => persist(posts.map((p) => (p._id === next._id ? next : p)));

  const deletePost = (id) => {
    // 刪除後其餘方塊自動重新編號（post_id 依順序顯示）
    persist(posts.filter((p) => p._id !== id));
  };

  const addLinkToPost = (postId, link) =>
    persist(posts.map((p) => (p._id === postId ? { ...p, links: [...p.links, link] } : p)));

  const deleteLink = (postId, linkId) =>
    persist(
      posts.map((p) =>
        p._id === postId ? { ...p, links: p.links.filter((l) => l._id !== linkId) } : p
      )
    );

  const handleCopy = async (text, key) => {
    const ok = await copyText(text);
    setCopied(ok ? key : "");
    if (ok) setTimeout(() => setCopied(""), 1600);
  };

  // --- 匯出 CSV（一列一篇貼文，連結用「 | 」串接） ---
  const exportCSV = () => {
    const headers = ["post_id","post_name","publish_date","theme","format","reach","likes","shares","comments","link_clicks","Medium","CTR","增加粉絲數量","連結數","連結","職缺名稱","文案"];
    const lines = posts.map((p, i) => {
      const ctr = calcCTR(p);
      const vals = [
        i + 1,
        p.post_name,
        p.publish_date,
        p.theme,
        p.format,
        p.reach,
        p.likes,
        p.shares,
        p.comments,
        p.link_clicks,
        p.medium,
        ctr === null ? "" : ctr.toFixed(2) + "%",
        p.fans_gained,
        p.links.length,
        p.links.map((l) => buildTrackedUrl(l.url, p.medium, p.publish_date) || l.url).join(" | "),
        p.links.map((l) => l.title).filter(Boolean).join(" | "),
        p.note,
      ];
      return vals.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
    });
    const csv = "\uFEFF" + headers.join(",") + "\n" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "job_posts.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ---------- 樣式 ----------
  const inputCls =
    "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";
  const labelCls = "block text-xs font-medium text-stone-500 mb-1";
  const btnPrimary =
    "rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
  const btnGhost =
    "rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  // ---------- 追蹤成效 Dashboard 用的統計運算 ----------
  const totalPosts = posts.length;
  const sumField = (k) => posts.reduce((acc, p) => acc + num(p[k]), 0);
  const totalReach = sumField("reach");
  const totalLikes = sumField("likes");
  const totalShares = sumField("shares");
  const totalComments = sumField("comments");
  const totalClicks = sumField("link_clicks");
  const totalFans = sumField("fans_gained");
  const overallCTR = totalReach > 0 ? (totalClicks / totalReach) * 100 : null;

  const statCards = [
    { label: "貼文篇數", value: String(totalPosts) },
    { label: "總 reach", value: totalReach.toLocaleString() },
    { label: "總 likes", value: totalLikes.toLocaleString() },
    { label: "總 shares", value: totalShares.toLocaleString() },
    { label: "總 comments", value: totalComments.toLocaleString() },
    { label: "總 link_clicks", value: totalClicks.toLocaleString() },
    { label: "總增加粉絲數", value: totalFans.toLocaleString() },
    { label: "整體 CTR", value: overallCTR === null ? "—" : overallCTR.toFixed(2) + "%" },
  ];

  const ranked = posts
    .map((p, i) => ({ ...p, _index: i, _ctr: calcCTR(p) }))
    .filter((p) => p._ctr !== null)
    .sort((a, b) => b._ctr - a._ctr)
    .slice(0, 5);

  const byMediumMap = {};
  posts.forEach((p) => {
    const key = p.medium || "（未選擇 Medium）";
    if (!byMediumMap[key]) {
      byMediumMap[key] = { medium: key, count: 0, reach: 0, clicks: 0 };
    }
    byMediumMap[key].count += 1;
    byMediumMap[key].reach += num(p.reach);
    byMediumMap[key].clicks += num(p.link_clicks);
  });
  const byMedium = Object.values(byMediumMap).sort((a, b) => b.reach - a.reach);

  return (
    <div className="min-h-screen bg-stone-100 font-sans text-stone-800">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* 標題 */}
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">職促文小工具</h1>
          <p className="mt-1 text-sm text-stone-500">
            追蹤成效總覽，以及方塊式貼文文案管理（post_id 與 publish_date 自動帶入）。
          </p>
        </header>

        {/* 分頁 */}
        <div className="mb-6 flex gap-1 rounded-lg bg-stone-200 p-1 w-fit">
          {[
            { id: "dashboard", label: "① 追蹤成效" },
            { id: "track", label: "② 文案集散地" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors " +
                (tab === t.id ? "bg-white text-indigo-700 shadow-sm" : "text-stone-500 hover:text-stone-700")
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ---------- 分頁一：追蹤成效 Dashboard ---------- */}
        {tab === "dashboard" && (
          <div className="space-y-5">
            {/* 總覽卡片 */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {statCards.map((c) => (
                <div key={c.label} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <p className="text-xs text-stone-500">{c.label}</p>
                  <p className="mt-1 text-xl font-semibold text-stone-900">{c.value}</p>
                </div>
              ))}
            </div>

            {!loaded ? (
              <p className="rounded-xl border border-stone-200 bg-white px-5 py-8 text-sm text-stone-400 shadow-sm">
                載入中…
              </p>
            ) : totalPosts === 0 ? (
              <p className="rounded-xl border border-stone-200 bg-white px-5 py-8 text-sm text-stone-400 shadow-sm">
                還沒有任何貼文資料。到「文案集散地」新增貼文方塊，數據就會顯示在這裡。
              </p>
            ) : (
              <>
                {/* 貼文排行（依 CTR） */}
                <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-stone-700">貼文排行（依 CTR）</h2>
                    <button className={btnGhost} onClick={() => setTab("track")}>
                      去文案集散地看全部 →
                    </button>
                  </div>
                  {ranked.length === 0 ? (
                    <p className="text-sm text-stone-400">
                      目前還沒有可計算 CTR 的貼文（需同時填 reach 與 link_clicks）。
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {ranked.map((p, i) => (
                        <li
                          key={p._id}
                          className="flex flex-wrap items-center gap-3 rounded-md border border-stone-200 px-3 py-2"
                        >
                          <span className="rounded bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">
                            #{i + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm text-stone-700">
                            {p.post_name || "（未命名貼文）"}
                          </span>
                          <span className="text-xs text-stone-400">{p.publish_date}</span>
                          <span className="text-xs text-stone-400">{p.medium || "—"}</span>
                          <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                            CTR {p._ctr.toFixed(2)}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* 依 Medium 分組 */}
                <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold text-stone-700">依 Medium（媒介）分組</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead>
                        <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                          <th className="py-2 pr-4">Medium</th>
                          <th className="py-2 pr-4">篇數</th>
                          <th className="py-2 pr-4">總 reach</th>
                          <th className="py-2 pr-4">總 link_clicks</th>
                          <th className="py-2 pr-4">CTR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byMedium.map((m) => (
                          <tr key={m.medium} className="border-b border-stone-100 last:border-0">
                            <td className="py-2 pr-4 text-stone-700">{m.medium}</td>
                            <td className="py-2 pr-4 text-stone-500">{m.count}</td>
                            <td className="py-2 pr-4 text-stone-500">{m.reach.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-stone-500">{m.clicks.toLocaleString()}</td>
                            <td className="py-2 pr-4 font-medium text-indigo-700">
                              {m.reach > 0 ? ((m.clicks / m.reach) * 100).toFixed(2) + "%" : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ---------- 分頁二：文案集散地（方塊式） ---------- */}
        {tab === "track" && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <button className={btnPrimary} onClick={() => addPost()}>
                ＋ 新增貼文方塊
              </button>
              <span className="text-xs text-stone-400">
                post_id 依方塊順序自動編號；publish_date 自動帶入建立當天。
              </span>
              <div className="ml-auto flex items-center gap-3">
                {saveMsg && <span className="text-sm text-amber-700">{saveMsg}</span>}
                <button className={btnGhost} onClick={exportCSV} disabled={posts.length === 0}>
                  匯出 CSV（共 {posts.length} 篇）
                </button>
              </div>
            </div>

            {!loaded ? (
              <p className="rounded-xl border border-stone-200 bg-white px-5 py-8 text-sm text-stone-400 shadow-sm">
                載入中…
              </p>
            ) : posts.length === 0 ? (
              <p className="rounded-xl border border-stone-200 bg-white px-5 py-8 text-sm text-stone-400 shadow-sm">
                還沒有貼文方塊。按「＋ 新增貼文方塊」建立第一篇。
              </p>
            ) : (
              posts.map((p, i) => (
                <PostCard
                  key={p._id}
                  post={p}
                  index={i}
                  onChange={updatePost}
                  onDelete={deletePost}
                  onAddLink={addLinkToPost}
                  onDeleteLink={deleteLink}
                  onCopy={handleCopy}
                  copied={copied}
                  options={options}
                  onAddOption={addOption}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
