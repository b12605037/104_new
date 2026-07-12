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

// 透過自家 serverless function 查職缺名稱（見 /api/job-title.js）
async function fetchJobTitle(url) {
  const r = await fetch("/api/job-title?url=" + encodeURIComponent(url));
  if (!r.ok) throw new Error("查詢服務回應異常（" + r.status + "）");
  return await r.json(); // { jobTitle, company }
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

// ---------- 貼文方塊 ----------

function PostCard({ post, index, onChange, onDelete, onAddLink, onDeleteLink, onCopy, copied }) {
  const [linkInput, setLinkInput] = useState("");
  const [linkErr, setLinkErr] = useState("");
  const [fetchingLinkId, setFetchingLinkId] = useState(null);

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

  const lookupTitle = async (link) => {
    setFetchingLinkId(link._id);
    try {
      const r = await fetchJobTitle(link.url);
      if (r.jobTitle) {
        onChange({
          ...post,
          links: post.links.map((l) =>
            l._id === link._id
              ? { ...l, title: r.jobTitle + (r.company ? "｜" + r.company : "") }
              : l
          ),
        });
      }
    } catch {
      // 查詢失敗就維持原狀，使用者可手動輸入
    }
    setFetchingLinkId(null);
  };

  const fields = [
    { k: "post_name", label: "post_name（貼文名稱）", w: "flex-1 min-w-56" },
    { k: "theme", label: "theme（主題）", w: "w-40" },
    { k: "format", label: "format（形式）", w: "w-36" },
    { k: "medium", label: "Medium（媒介）", w: "w-36" },
  ];
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
          {fields.map((f) => (
            <div key={f.k} className={f.w}>
              <label className={labelCls}>{f.label}</label>
              <input
                className={inputCls}
                value={post[f.k]}
                onChange={(e) => set(f.k, e.target.value)}
              />
            </div>
          ))}
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

        {/* 備註 */}
        <div>
          <label className={labelCls}>備註</label>
          <input className={inputCls} value={post.note} onChange={(e) => set("note", e.target.value)} />
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
                      className="shrink-0 text-xs text-stone-500 hover:text-stone-700 disabled:opacity-40"
                      onClick={() => lookupTitle(l)}
                      disabled={fetchingLinkId === l._id}
                    >
                      {fetchingLinkId === l._id ? "查詢中…" : "查職稱"}
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
                    placeholder="職缺名稱（按「查職稱」自動帶入，或手動輸入）"
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
  const [tab, setTab] = useState("url");

  // --- 網址工具狀態 ---
  const [rawUrl, setRawUrl] = useState("");
  const [cleaned, setCleaned] = useState(null);
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState("");
  const [copied, setCopied] = useState("");
  const [targetPost, setTargetPost] = useState("new"); // "new" 或 post._id

  // --- 貼文方塊狀態 ---
  const [posts, setPosts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const saveTimer = useRef(null);

  // 載入已儲存資料（含舊格式轉換）
  useEffect(() => {
    setPosts(migrate(loadPosts()));
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

  // --- 網址工具邏輯 ---
  const handleUrlChange = (v) => {
    setRawUrl(v);
    setJobTitle("");
    setCompany("");
    setFetchErr("");
    setCleaned(cleanUrl104(v));
  };

  const handleFetchTitle = async () => {
    if (!cleaned?.ok) return;
    setFetching(true);
    setFetchErr("");
    try {
      const r = await fetchJobTitle(cleaned.url);
      if (r.jobTitle) {
        setJobTitle(r.jobTitle);
        setCompany(r.company || "");
      } else {
        setFetchErr("查不到這個職缺的名稱，可能已關閉或網址有誤，可手動輸入。");
      }
    } catch (e) {
      setFetchErr("查詢失敗：" + (e?.message || "未知錯誤") + "。可再試一次，或手動輸入職稱。");
    }
    setFetching(false);
  };

  const handleCopy = async (text, key) => {
    const ok = await copyText(text);
    setCopied(ok ? key : "");
    if (ok) setTimeout(() => setCopied(""), 1600);
  };

  // 把清理後的連結加進指定方塊（或建立新方塊）
  const sendToTracker = () => {
    if (!cleaned?.ok) return;
    const link = {
      _id: uid(),
      url: cleaned.url,
      title: jobTitle ? `${jobTitle}${company ? "｜" + company : ""}` : "",
    };
    if (targetPost === "new" || posts.length === 0) {
      const p = {
        _id: uid(),
        publish_date: todayStr(),
        ...emptyPostFields,
        post_name: link.title,
        links: [link],
      };
      persist([...posts, p]);
    } else {
      persist(
        posts.map((p) => (p._id === targetPost ? { ...p, links: [...p.links, link] } : p))
      );
    }
    setTab("track");
  };

  // --- 匯出 CSV（一列一篇貼文，連結用「 | 」串接） ---
  const exportCSV = () => {
    const headers = ["post_id","post_name","publish_date","theme","format","reach","likes","shares","comments","link_clicks","Medium","CTR","增加粉絲數量","連結數","連結","職缺名稱","備註"];
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
        p.links.map((l) => l.url).join(" | "),
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

  return (
    <div className="min-h-screen bg-stone-100 font-sans text-stone-800">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* 標題 */}
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">職促文小工具</h1>
          <p className="mt-1 text-sm text-stone-500">
            104 網址清理＋職稱帶入，以及方塊式貼文成效追蹤（post_id 與 publish_date 自動帶入）。
          </p>
        </header>

        {/* 分頁 */}
        <div className="mb-6 flex gap-1 rounded-lg bg-stone-200 p-1 w-fit">
          {[
            { id: "url", label: "① 網址工具" },
            { id: "track", label: "② 成效追蹤" },
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

        {/* ---------- 分頁一：網址工具 ---------- */}
        {tab === "url" && (
          <div className="space-y-5">
            <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <label className={labelCls}>貼上 104 職缺網址</label>
              <input
                className={inputCls}
                placeholder="https://www.104.com.tw/job/xxxxx?jobsource=..."
                value={rawUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
              />
              {cleaned && !cleaned.ok && cleaned.error && (
                <p className="mt-2 text-sm text-red-600">{cleaned.error}</p>
              )}

              {cleaned?.ok && (
                <div className="mt-4 space-y-4">
                  <div>
                    <label className={labelCls}>清理後網址（已移除 jobsource）</label>
                    <div className="flex gap-2">
                      <input className={inputCls + " bg-stone-50"} readOnly value={cleaned.url} />
                      <button className={btnGhost + " shrink-0"} onClick={() => handleCopy(cleaned.url, "url")}>
                        {copied === "url" ? "已複製 ✓" : "複製"}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button className={btnPrimary} onClick={handleFetchTitle} disabled={fetching}>
                      {fetching ? "查詢中…" : "查詢職缺名稱"}
                    </button>
                    <span className="text-xs text-stone-400">會連網查詢該頁面的職稱，約需幾秒。</span>
                  </div>

                  {fetchErr && <p className="text-sm text-amber-700">{fetchErr}</p>}

                  <div>
                    <label className={labelCls}>職缺名稱（可手動修改）</label>
                    <div className="flex gap-2">
                      <input
                        className={inputCls}
                        placeholder="例如：資深前端工程師"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                      />
                      <button
                        className={btnGhost + " shrink-0"}
                        onClick={() => handleCopy(jobTitle, "title")}
                        disabled={!jobTitle}
                      >
                        {copied === "title" ? "已複製 ✓" : "複製"}
                      </button>
                    </div>
                    {company && <p className="mt-1 text-xs text-stone-500">公司：{company}</p>}
                  </div>

                  {/* 選擇要加進哪個貼文方塊 */}
                  <div className="flex flex-wrap items-end gap-3 rounded-lg bg-stone-50 border border-stone-200 p-3">
                    <div>
                      <label className={labelCls}>加入哪個貼文方塊？</label>
                      <select
                        className={inputCls + " w-64"}
                        value={targetPost}
                        onChange={(e) => setTargetPost(e.target.value)}
                      >
                        <option value="new">＋ 建立新方塊（日期自動帶今天）</option>
                        {posts.map((p, i) => (
                          <option key={p._id} value={p._id}>
                            #{i + 1}｜{p.publish_date}｜{p.post_name || "（未命名貼文）"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button className={btnGhost + " bg-white"} onClick={sendToTracker}>
                      帶入成效追蹤 →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------- 分頁二：成效追蹤（方塊式） ---------- */}
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
                還沒有貼文方塊。按「＋ 新增貼文方塊」建立第一篇，或從「網址工具」帶入連結。
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
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
