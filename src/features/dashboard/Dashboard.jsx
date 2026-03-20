import { useState, useRef, useEffect, useMemo, useId, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { verifyCredentials, sendChat, fetchRawTables, fetchRawTable, logoutApi } from "../../api/client";

const SIDEBAR_BREAKPOINT = 1024; // lg
const SAVED_CONNECTIONS_KEY = "syndb_saved_connections";
const SAVED_CONNECTED_IDS_KEY = "syndb_connected_connection_ids";
const CHAT_STORE_KEY = "syndb_chat_sessions_v1";
const MAX_CHAT_SESSIONS = 80;

function createChatSession() {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
    title: "New chat",
    updatedAt: Date.now(),
    messages: [],
  };
}

function normalizeChatSession(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  if (!id) return null;
  return {
    id,
    title: String(raw.title || "Chat").trim() || "Chat",
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    messages: Array.isArray(raw.messages) ? raw.messages : [],
  };
}

function loadChatBootstrap() {
  try {
    const raw = localStorage.getItem(CHAT_STORE_KEY);
    if (!raw) {
      const s = createChatSession();
      return { sessions: [s], activeChatId: s.id };
    }
    const data = JSON.parse(raw);
    let sessions = Array.isArray(data.sessions) ? data.sessions.map(normalizeChatSession).filter(Boolean) : [];
    const seen = new Set();
    sessions = sessions.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
    if (sessions.length === 0) {
      const s = createChatSession();
      return { sessions: [s], activeChatId: s.id };
    }
    let activeChatId = typeof data.activeChatId === "string" ? data.activeChatId : "";
    if (!sessions.some((s) => s.id === activeChatId)) activeChatId = sessions[0].id;
    return { sessions, activeChatId };
  } catch {
    const s = createChatSession();
    return { sessions: [s], activeChatId: s.id };
  }
}

function formatHistoryTime(ts) {
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const sameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (sameDay) {
      return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  } catch {
    return "";
  }
}

const CONNECTION_TYPE_FIELDS = {
  mysql: ["host", "port", "username", "password", "database"],
  postgres: ["host", "port", "username", "password", "database"],
  mongodb: ["connectionUri", "database"],
  oracle: ["host", "port", "username", "password", "service"],
};

const FIELD_LABELS = {
  host: "Host",
  port: "Port",
  username: "Username",
  password: "Password",
  database: "Database",
  service: "Service",
  connectionUri: "Connection URI",
};

const sidebarNavItems = [
  { id: "chat", label: "Chatting", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
  { id: "connection", label: "Connection", icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" },
  { id: "viewraw", label: "View Raw", icon: "M4 6h16M4 10h16M4 14h16M4 18h16" },
  { id: "history", label: "History", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  { id: "newchat", label: "New Chat", icon: "M12 4v16m8-8H4" },
];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function SidebarIcon({ d }) {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  );
}

function formatCellValue(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function rowMatchesSearch(row, queryLower) {
  if (!queryLower) return true;
  const terms = queryLower.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  // Match only cell values so column names like "id" don't match every row
  const haystack = (row || []).map((cell) => formatCellValue(cell).toLowerCase()).join(" ");
  return terms.every((t) => haystack.includes(t));
}

function DataPreviewMessage({ title, subtitle, columns, rows, footnote }) {
  const tableSearchId = useId();
  const [tableSearch, setTableSearch] = useState("");
  const safeColumns = Array.isArray(columns) ? columns : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  const queryLower = tableSearch.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    if (!queryLower) return safeRows;
    return safeRows.filter((row) => rowMatchesSearch(row, queryLower));
  }, [safeRows, queryLower]);

  return (
    <div className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm shadow-slate-200/50">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
        <div className="min-w-0">
          <h3 className="text-sm sm:text-base font-semibold text-slate-900 tracking-tight truncate">{title}</h3>
          {subtitle ? (
            <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 uppercase tracking-wider">{subtitle}</p>
          ) : null}
        </div>
        {safeColumns.length > 0 ? (
          <div className="flex gap-2 text-[11px] sm:text-xs">
            <span className="rounded-lg bg-emerald-50 px-2 py-1 text-slate-700 border border-emerald-100">
              <span className="text-[#00a078] font-semibold">{safeColumns.length}</span> cols
            </span>
            <span className="rounded-lg bg-emerald-50 px-2 py-1 text-slate-700 border border-emerald-100">
              <span className="text-[#00a078] font-semibold">{safeRows.length}</span> rows
            </span>
          </div>
        ) : null}
      </div>
      {safeColumns.length === 0 ? (
        <div className="p-4 text-slate-500 text-sm">No data.</div>
      ) : (
        <>
          <div className="px-3 py-2.5 sm:px-4 border-b border-slate-100 bg-slate-50/80">
            <label className="sr-only" htmlFor={tableSearchId}>
              Search table rows
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 focus-within:border-[#00a078]/50 focus-within:ring-2 focus-within:ring-[#00a078]/15 transition">
              <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                id={tableSearchId}
                type="search"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Search in row data… (space = all words must match)"
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-slate-900 placeholder-slate-400"
                autoComplete="off"
              />
              {queryLower ? (
                <span className="text-[11px] text-[#00a078] font-medium whitespace-nowrap tabular-nums">
                  {filteredRows.length}/{safeRows.length}
                </span>
              ) : null}
              {tableSearch ? (
                <button
                  type="button"
                  onClick={() => setTableSearch("")}
                  className="text-slate-500 hover:text-slate-900 text-xs px-1.5 py-0.5 rounded-md hover:bg-slate-100"
                  aria-label="Clear search"
                >
                  Clear
                </button>
              ) : null}
            </div>
            {queryLower && filteredRows.length === 0 && safeRows.length > 0 ? (
              <p className="text-xs text-amber-600 mt-2 px-0.5">No rows match your search — try different words.</p>
            ) : null}
          </div>
          <div className="w-full min-w-0 overflow-x-auto overflow-y-auto max-h-[min(52vh,420px)]">
            <table className="w-full min-w-max text-sm border-collapse">
              <thead>
                <tr className="sticky top-0 z-20 shadow-[0_1px_0_0_rgba(15,23,42,0.08)]">
                  {safeColumns.map((col) => (
                    <th
                      key={col.name}
                      className="text-left align-bottom bg-slate-100 border-b border-r border-slate-200 last:border-r-0 px-3 py-2.5 min-w-[7rem]"
                    >
                      <div className="font-semibold text-slate-900 text-[13px] leading-snug break-words">{col.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-1 leading-tight break-all opacity-90">{col.type}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {safeRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(safeColumns.length, 1)}
                      className="px-4 py-6 text-center text-slate-500 text-sm border-b border-slate-100"
                    >
                      No rows.
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(safeColumns.length, 1)}
                      className="px-4 py-6 text-center text-slate-500 text-sm border-b border-slate-100"
                    >
                      No matching rows — adjust search.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b border-slate-100 transition-colors hover:bg-emerald-50/40 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/70"}`}
                    >
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className="align-top px-3 py-2 border-r border-slate-100 last:border-r-0 text-[13px] break-words"
                          title={cell != null ? String(cell) : ""}
                        >
                          {cell == null || cell === "" ? (
                            <span className="text-slate-400 italic text-xs">—</span>
                          ) : (
                            <span className="font-mono text-slate-800 break-words whitespace-pre-wrap">{formatCellValue(cell)}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {footnote ? (
        <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500">{footnote}</div>
      ) : null}
    </div>
  );
}

const chatBootstrapOnce = loadChatBootstrap();

export default function Dashboard() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const handleSignOut = useCallback(async () => {
    await logoutApi();
    navigate("/", { replace: true });
  }, [navigate]);

  const [message, setMessage] = useState("");
  const [chatSessions, setChatSessions] = useState(() => chatBootstrapOnce.sessions);
  const [activeChatId, setActiveChatId] = useState(() => chatBootstrapOnce.activeChatId);
  const [loading, setLoading] = useState(false);

  const messages = useMemo(() => {
    const s = chatSessions.find((x) => x.id === activeChatId);
    return s?.messages ?? [];
  }, [chatSessions, activeChatId]);

  const setMessages = useCallback((updater) => {
    setChatSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeChatId) return s;
        const prevMsgs = s.messages;
        const nextMsgs = typeof updater === "function" ? updater(prevMsgs) : updater;
        let title = s.title || "New chat";
        if (title === "New chat" && nextMsgs.length > 0) {
          const fu = nextMsgs.find((m) => m.role === "user" && typeof m.content === "string" && m.content.trim());
          if (fu) {
            const t = fu.content.replace(/\s+/g, " ").trim();
            title = t.length > 52 ? `${t.slice(0, 52)}…` : t;
          }
        }
        return { ...s, messages: nextMsgs, updatedAt: Date.now(), title };
      })
    );
  }, [activeChatId]);

  const historySessionsSorted = useMemo(
    () => [...chatSessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [chatSessions]
  );

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState("chat");
  const [connectionName, setConnectionName] = useState("");
  const [connectionType, setConnectionType] = useState("");
  const [connectionDetails, setConnectionDetails] = useState({
    host: "",
    port: "",
    username: "",
    password: "",
    database: "",
    service: "",
    connectionUri: "",
  });
  const [savedConnections, setSavedConnections] = useState(() => {
    try {
      const raw = localStorage.getItem(SAVED_CONNECTIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [editingConnectionId, setEditingConnectionId] = useState(null);
  const [connectedConnectionIds, setConnectedConnectionIds] = useState(() => {
    try {
      const rawConnections = localStorage.getItem(SAVED_CONNECTIONS_KEY);
      const saved = rawConnections ? JSON.parse(rawConnections) : [];
      const rawIds = localStorage.getItem(SAVED_CONNECTED_IDS_KEY);
      const ids = rawIds ? JSON.parse(rawIds) : [];
      const validIds = ids.filter((id) => saved.some((c) => c.id === id));
      return new Set(validIds);
    } catch {
      return new Set();
    }
  });
  const [connectModal, setConnectModal] = useState({ open: false, connecting: false, connected: null, message: "", dbType: "", errorDetail: "" });

  // View Raw: selected connection, tables list, selected table schema + data
  const [rawSelectedConn, setRawSelectedConn] = useState(null);
  const [rawTables, setRawTables] = useState([]);
  const [rawTablesLoading, setRawTablesLoading] = useState(false);
  const [rawTablesError, setRawTablesError] = useState("");
  const [rawSelectedTable, setRawSelectedTable] = useState(null);
  const [rawTableData, setRawTableData] = useState({ columns: [], rows: [], documents: null, format: null });
  const [rawTableLoading, setRawTableLoading] = useState(false);
  const [rawTableError, setRawTableError] = useState("");
  const [rawMongoShowJson, setRawMongoShowJson] = useState(false);
  /** MongoDB: pick DB when URI has no /dbname and cluster has multiple DBs */
  const [rawMongoDatabases, setRawMongoDatabases] = useState([]);
  const [rawMongoDb, setRawMongoDb] = useState("");

  const scrollRef = useRef(null);
  const connectionFormRef = useRef(null);
  const chatInputRef = useRef(null);

  // @ mention: connected connections only (level 1)
  const [cursorPosition, setCursorPosition] = useState(0);
  const [atSuggestionsSelectedIndex, setAtSuggestionsSelectedIndex] = useState(0);

  const connectedConnections = savedConnections.filter((c) => connectedConnectionIds.has(c.id));
  const lastAtIndex = message.lastIndexOf("@", cursorPosition - 1);

  // Level 2: tables/collections (and for MongoDB, database list if needed)
  const [tableSuggestionsSelectedIndex, setTableSuggestionsSelectedIndex] = useState(0);
  const [tablesCache, setTablesCache] = useState(() => new Map()); // key -> { tables, needs_database, databases, database_used, ts }
  const [tablesLoading, setTablesLoading] = useState(false);
  const [mongoDbSelections, setMongoDbSelections] = useState(() => new Map()); // conn.id -> dbName

  function getActiveConnectionMention(text) {
    const found = findBestConnectionMention(text, cursorPosition);
    return found?.conn ?? null;
  }

  function findBestConnectionMention(text, beforeIndex = Infinity) {
    const hay = String(text || "");
    const hayLower = hay.toLowerCase();
    let best = null; // { conn, start, end }
    for (const conn of connectedConnections) {
      const name = (conn?.name || "").trim();
      if (!name) continue;
      const needle = ("@" + name).toLowerCase();
      let idx = hayLower.indexOf(needle);
      while (idx !== -1) {
        const end = idx + needle.length;
        if (end <= beforeIndex) {
          if (!best) best = { conn, start: idx, end };
          else if (end > best.end) best = { conn, start: idx, end };
          else if (end === best.end && needle.length > (("@"+(best.conn?.name||"")).length)) best = { conn, start: idx, end };
        }
        idx = hayLower.indexOf(needle, idx + 1);
      }
    }
    return best;
  }

  function getAtMode() {
    if (lastAtIndex === -1) return { mode: "none" };
    const activeConnHit = findBestConnectionMention(message, lastAtIndex);
    const activeConn = activeConnHit?.conn ?? null;
    if (!activeConn) {
      const atQuery = message.slice(lastAtIndex + 1, cursorPosition);
      return { mode: "connection", atQuery, activeConn: null };
    }

    // If current "@" is after the connection mention -> table/collection picker.
    const connEndIndex = activeConnHit?.end ?? -1;
    if (connEndIndex !== -1 && lastAtIndex > connEndIndex) {
      const atQuery = message.slice(lastAtIndex + 1, cursorPosition);
      return { mode: "table", atQuery, activeConn };
    }
    const atQuery = message.slice(lastAtIndex + 1, cursorPosition);
    return { mode: "connection", atQuery, activeConn: null };
  }

  const atMode = getAtMode();
  const showAtSuggestions = atMode.mode === "connection" || atMode.mode === "table";
  const atQuery = atMode.atQuery || "";

  const atSuggestionsList =
    atMode.mode === "connection"
      ? connectedConnections.filter((c) => c.name.toLowerCase().includes(atQuery.toLowerCase()))
      : [];
  const safeSelectedIndex = Math.min(atSuggestionsSelectedIndex, Math.max(0, atSuggestionsList.length - 1));

  function tablesCacheKey(conn, dbOverride) {
    if (!conn?.id) return "";
    if ((conn.type || "").toLowerCase() !== "mongodb") return conn.id;
    const rememberedDb = mongoDbSelections.get(conn.id) || "";
    const db = (dbOverride ?? conn.database ?? rememberedDb ?? "").trim();
    return `${conn.id}::${db || "__no_db__"}`;
  }

  const tableState =
    atMode.mode === "table" && atMode.activeConn ? tablesCache.get(tablesCacheKey(atMode.activeConn)) : null;
  const tableSuggestionsList = (() => {
    if (atMode.mode !== "table" || !atMode.activeConn) return [];
    if (!tableState) return [];
    const query = atQuery.toLowerCase();
    if (tableState.needs_database && Array.isArray(tableState.databases) && tableState.databases.length > 0) {
      return tableState.databases.filter((d) => d.toLowerCase().includes(query)).map((d) => ({ kind: "database", value: d }));
    }
    const tables = Array.isArray(tableState.tables) ? tableState.tables : [];
    return tables.filter((t) => t.toLowerCase().includes(query)).map((t) => ({ kind: "table", value: t }));
  })();
  const safeTableSelectedIndex = Math.min(tableSuggestionsSelectedIndex, Math.max(0, tableSuggestionsList.length - 1));

  function selectConnectionForAt(conn) {
    const insert = "@" + (conn.name || "");
    const newMsg = message.slice(0, lastAtIndex) + insert + " " + message.slice(cursorPosition);
    setMessage(newMsg);
    const newCursor = lastAtIndex + insert.length + 1;
    setCursorPosition(newCursor);
    setAtSuggestionsSelectedIndex(0);
    setTableSuggestionsSelectedIndex(0);
    setTimeout(() => {
      chatInputRef.current?.focus();
      chatInputRef.current?.setSelectionRange(newCursor, newCursor);
    }, 0);
  }

  async function ensureTablesLoaded(conn) {
    if (!conn?.id || tablesLoading) return;
    const key = tablesCacheKey(conn);
    const cached = tablesCache.get(key);
    if (cached && Date.now() - (cached.ts || 0) < 60_000) return;
    setTablesLoading(true);
    try {
      const isMongo = (conn.type || "").toLowerCase() === "mongodb";
      const rememberedDb = isMongo ? (mongoDbSelections.get(conn.id) || "").trim() : "";
      const connForFetch = isMongo && !String(conn.database || "").trim() && rememberedDb ? { ...conn, database: rememberedDb } : conn;
      const result = await fetchRawTables(connForFetch);
      setTablesCache((prev) => {
        const next = new Map(prev);
        next.set(tablesCacheKey(connForFetch), {
          tables: result.tables ?? [],
          needs_database: Boolean(result.needs_database),
          databases: result.databases ?? [],
          database_used: result.database_used ?? null,
          ts: Date.now(),
        });
        return next;
      });
    } finally {
      setTablesLoading(false);
    }
  }

  function replaceAtTokenWith(textToInsert) {
    const insert = "@" + String(textToInsert || "");
    const newMsg = message.slice(0, lastAtIndex) + insert + " " + message.slice(cursorPosition);
    setMessage(newMsg);
    const newCursor = lastAtIndex + insert.length + 1;
    setCursorPosition(newCursor);
    setTimeout(() => {
      chatInputRef.current?.focus();
      chatInputRef.current?.setSelectionRange(newCursor, newCursor);
    }, 0);
  }

  async function handlePickTableOrCollection(conn, tableName, opts = {}) {
    if (!conn || !tableName) return;
    const connForView = opts.database ? { ...conn, database: opts.database } : conn;
    setMessages((prev) => [
      ...prev,
      { role: "assistant", kind: "info", content: `Loading ${connForView.type === "mongodb" ? "collection" : "table"}: ${tableName}…` },
    ]);
    try {
      const result = await fetchRawTable(connForView, tableName);
      if (result.error) {
        setMessages((prev) => [...prev, { role: "assistant", content: result.error }]);
        return;
      }
      const title =
        connForView.type === "mongodb" ? `${tableName}` : `${tableName}`;
      const subtitle =
        connForView.type === "mongodb"
          ? `MongoDB · ${connForView.database ? `db ${connForView.database} · ` : ""}collection preview`
          : `${connForView.type === "postgres" ? "PostgreSQL" : connForView.type === "mysql" ? "MySQL" : "Oracle"} · table preview`;
      const footnote =
        connForView.type === "mongodb"
          ? "Nested objects/arrays shown as JSON strings · up to 1000 docs"
          : "Showing up to 1000 rows";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          kind: "data_preview",
          title,
          subtitle,
          columns: result.columns ?? [],
          rows: result.rows ?? [],
          footnote,
        },
      ]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: e.message || "Failed to load preview." }]);
    }
  }

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_CONNECTIONS_KEY, JSON.stringify(savedConnections));
    } catch (e) {
      console.warn("Could not persist connections", e);
    }
  }, [savedConnections]);

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_CONNECTED_IDS_KEY, JSON.stringify([...connectedConnectionIds]));
    } catch (e) {
      console.warn("Could not persist connected connection ids", e);
    }
  }, [connectedConnectionIds]);

  useEffect(() => {
    try {
      if (chatSessions.length > MAX_CHAT_SESSIONS) {
        const sorted = [...chatSessions].sort((a, b) => b.updatedAt - a.updatedAt);
        const active = sorted.find((s) => s.id === activeChatId) ?? sorted[0];
        const rest = sorted.filter((s) => s.id !== active.id).slice(0, MAX_CHAT_SESSIONS - 1);
        setChatSessions([active, ...rest]);
        return;
      }
      localStorage.setItem(CHAT_STORE_KEY, JSON.stringify({ version: 1, sessions: chatSessions, activeChatId }));
    } catch (e) {
      console.warn("Could not persist chats", e);
    }
  }, [chatSessions, activeChatId]);

  useEffect(() => {
    if (chatSessions.length > 0 && !chatSessions.some((s) => s.id === activeChatId)) {
      setActiveChatId(chatSessions[0].id);
    }
  }, [chatSessions, activeChatId]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  useEffect(() => {
    if (atMode.mode === "table" && atMode.activeConn) {
      ensureTablesLoaded(atMode.activeConn);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atMode.mode, atMode.activeConn?.id]);

  // Close sidebar when resizing to desktop
  useEffect(() => {
    const handler = () => {
      if (window.innerWidth >= SIDEBAR_BREAKPOINT) setSidebarOpen(false);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (sidebarOpen && window.innerWidth < SIDEBAR_BREAKPOINT) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  function getConnectionAndQuestion(text) {
    const trimmed = text.trim();
    if (connectedConnections.length === 0) return { connection: null, question: trimmed };

    const atIdx = trimmed.indexOf("@");
    if (atIdx !== -1) {
      const afterAt = trimmed.slice(atIdx);
      let best = null;
      let bestLen = 0;
      for (const conn of connectedConnections) {
        const name = conn.name || "";
        const prefix = "@" + name;
        if ((afterAt.startsWith(prefix + " ") || afterAt === prefix) && name.length > bestLen) {
          best = conn;
          bestLen = name.length;
        }
      }
      if (best) {
        const question = afterAt.slice(bestLen + 1).trim();
        return { connection: best, question: question || trimmed };
      }
    }
    return { connection: connectedConnections[0], question: trimmed };
  }

  async function handleSend() {
    const text = message.trim();
    if (!text || loading) return;
    const userMsg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setMessage("");
    setLoading(true);

    const { connection, question } = getConnectionAndQuestion(text);
    if (!connection) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Connect a database (PostgreSQL, MySQL, Oracle, or MongoDB) from the Connection tab, then ask your question. You can also type @ and pick a connected connection.",
        },
      ]);
      setLoading(false);
      return;
    }
    if (!question) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Type your question about the database after the connection name, e.g. \"@MyDB How many tables are there?\"" },
      ]);
      setLoading(false);
      return;
    }

    try {
      const result = await sendChat(question, connection);
      if (result.error) {
        setMessages((prev) => [...prev, { role: "assistant", content: result.error }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: result.answer || "No answer." }]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: err.message || "Network or server error. Try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleNewChat() {
    const newSess = createChatSession();
    setChatSessions((prev) => [newSess, ...prev]);
    setActiveChatId(newSess.id);
    setMessage("");
    setLoading(false);
  }

  function handleOpenHistorySession(sessionId) {
    if (!sessionId || !chatSessions.some((s) => s.id === sessionId)) return;
    setActiveChatId(sessionId);
    setActiveView("chat");
    setLoading(false);
    if (typeof window !== "undefined" && window.innerWidth < SIDEBAR_BREAKPOINT) setSidebarOpen(false);
  }

  function setConnectionDetail(key, value) {
    setConnectionDetails((prev) => ({ ...prev, [key]: value }));
  }

  function handleSaveConnection() {
    const type = connectionType;
    if (!connectionName.trim() || !type) return;
    const payload = {
      id: editingConnectionId || Date.now().toString(36) + Math.random().toString(36).slice(2),
      name: connectionName.trim(),
      type,
      ...connectionDetails,
    };
    if (editingConnectionId) {
      setSavedConnections((prev) => prev.map((c) => (c.id === editingConnectionId ? payload : c)));
      setEditingConnectionId(null);
    } else {
      setSavedConnections((prev) => [...prev, payload]);
    }
    setConnectionName("");
    setConnectionType("");
    setConnectionDetails({
      host: "",
      port: "",
      username: "",
      password: "",
      database: "",
      service: "",
      connectionUri: "",
    });
    connectionFormRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function handleEditConnection(conn) {
    setConnectionName(conn.name);
    setConnectionType(conn.type);
    setConnectionDetails({
      host: conn.host ?? "",
      port: conn.port ?? "",
      username: conn.username ?? "",
      password: conn.password ?? "",
      database: conn.database ?? "",
      service: conn.service ?? "",
      connectionUri: conn.connectionUri ?? "",
    });
    setEditingConnectionId(conn.id);
    connectionFormRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function handleConnect(conn) {
    setConnectModal((m) => ({ ...m, open: true, connecting: true, connected: null, message: "", dbType: conn.type ?? "", errorDetail: "" }));
    try {
      const result = await verifyCredentials(conn);
      setConnectModal((m) => ({
        ...m,
        connecting: false,
        connected: result.connected,
        message: result.message,
        dbType: result.db_type ?? conn.type ?? "",
        errorDetail: result.error_detail ?? "",
      }));
      if (result.connected) setConnectedConnectionIds((prev) => new Set(prev).add(conn.id));
    } catch (err) {
      setConnectModal((m) => ({
        ...m,
        connecting: false,
        connected: false,
        message: "Not Connected",
        dbType: conn.type ?? "",
        errorDetail: err.message || "Network or server error",
      }));
    }
  }

  function handleDeleteConnection(conn) {
    setSavedConnections((prev) => prev.filter((c) => c.id !== conn.id));
    setConnectedConnectionIds((prev) => {
      const next = new Set(prev);
      next.delete(conn.id);
      return next;
    });
    if (editingConnectionId === conn.id) setEditingConnectionId(null);
  }

  function closeConnectModal() {
    setConnectModal((m) => ({ ...m, open: false }));
  }

  async function handleRawSelectConnection(conn) {
    setRawSelectedConn(conn ?? null);
    setRawSelectedTable(null);
    setRawTableData({ columns: [], rows: [], documents: null, format: null });
    setRawTableError("");
    setRawMongoShowJson(false);
    setRawMongoDatabases([]);
    setRawMongoDb("");
    if (!conn) {
      setRawTables([]);
      setRawTablesError("");
      return;
    }
    setRawTablesLoading(true);
    setRawTablesError("");
    try {
      const result = await fetchRawTables(conn);
      if (result.error) {
        setRawTablesError(result.error);
        setRawTables([]);
      } else if (conn.type === "mongodb" && result.needs_database && (result.databases?.length ?? 0) > 0) {
        setRawMongoDatabases(result.databases);
        setRawTables([]);
        setRawTablesError("");
      } else {
        setRawTables(result.tables ?? []);
        setRawTablesError("");
        if (conn.type === "mongodb") {
          setRawMongoDb(result.database_used || (conn.database || "").trim() || "");
        }
      }
    } catch (e) {
      setRawTablesError(e.message || "Failed to load tables");
      setRawTables([]);
    } finally {
      setRawTablesLoading(false);
    }
  }

  async function handleRawMongoDatabasePick(dbName) {
    if (!rawSelectedConn || !dbName) return;
    setRawMongoDb(dbName);
    setRawSelectedTable(null);
    setRawTableData({ columns: [], rows: [], documents: null, format: null });
    setRawMongoShowJson(false);
    setRawTablesLoading(true);
    setRawTablesError("");
    try {
      const conn = { ...rawSelectedConn, database: dbName };
      const result = await fetchRawTables(conn);
      if (result.error) {
        setRawTablesError(result.error);
        setRawTables([]);
      } else {
        setRawTables(result.tables ?? []);
        setRawTablesError("");
      }
    } catch (e) {
      setRawTablesError(e.message || "Failed to load collections");
      setRawTables([]);
    } finally {
      setRawTablesLoading(false);
    }
  }

  function rawViewConnection() {
    if (!rawSelectedConn) return null;
    if (rawSelectedConn.type !== "mongodb") return rawSelectedConn;
    const db = (rawMongoDb || rawSelectedConn.database || "").trim();
    return db ? { ...rawSelectedConn, database: db } : rawSelectedConn;
  }

  async function handleRawSelectTable(tableName) {
    const conn = rawViewConnection();
    if (!conn || !tableName) return;
    setRawSelectedTable(tableName);
    setRawMongoShowJson(false);
    setRawTableLoading(true);
    setRawTableError("");
    try {
      const result = await fetchRawTable(conn, tableName);
      if (result.error) {
        setRawTableError(result.error);
        setRawTableData({ columns: [], rows: [], documents: null, format: null });
      } else {
        setRawTableData({
          columns: result.columns ?? [],
          rows: result.rows ?? [],
          documents: result.documents ?? null,
          format: result.format ?? null,
        });
        setRawTableError("");
      }
    } catch (e) {
      setRawTableError(e.message || "Failed to load table");
      setRawTableData({ columns: [], rows: [], documents: null, format: null });
    } finally {
      setRawTableLoading(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-[#f5f7fb] text-slate-900 font-['Outfit',sans-serif]">
      {/* Connect result modal */}
      {connectModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="connect-modal-title"
          onClick={(e) => e.target === e.currentTarget && closeConnectModal()}
          onKeyDown={(e) => e.key === "Escape" && closeConnectModal()}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 shadow-xl shadow-slate-300/40 p-6 text-center">
            <h2 id="connect-modal-title" className="text-lg font-semibold text-slate-900 mb-3">
              {connectModal.connecting ? "Connecting…" : "Connection result"}
            </h2>
            {connectModal.connecting ? (
              <div className="flex justify-center py-4">
                <div className="w-8 h-8 border-2 border-[#00a78e] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <p
                  className={`text-base font-medium mb-1 ${
                    connectModal.connected ? "text-[#28c840]" : "text-[#f87171]"
                  }`}
                >
                  {connectModal.connected ? "Connected (Real DB)" : "Not Connected"}
                </p>
                {connectModal.dbType && (
                  <p className="text-slate-500 text-sm capitalize">{connectModal.dbType}</p>
                )}
                {connectModal.errorDetail && (
                  <p className="text-slate-600 text-xs mt-2 mb-3 text-left break-words bg-slate-50 rounded-lg p-2 max-h-24 overflow-y-auto border border-slate-100">
                    {connectModal.errorDetail}
                  </p>
                )}
                <button
                  type="button"
                  onClick={closeConnectModal}
                  className="w-full h-11 mt-4 rounded-xl bg-[#00a78e] text-white font-medium text-sm hover:bg-[#009580] active:scale-[0.98] transition"
                >
                  OK
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Backdrop — mobile only */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Close menu"
        className={`fixed inset-0 z-30 bg-slate-900/35 backdrop-blur-[2px] transition-opacity lg:hidden ${
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setSidebarOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setSidebarOpen(false)}
      />

      {/* Sidebar — drawer on mobile, static on lg+ */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 max-w-[85vw] flex-col bg-white border-r border-slate-200/90 shadow-xl shadow-slate-200/60 transition-transform duration-300 ease-out lg:relative lg:inset-auto lg:z-0 lg:w-56 lg:max-w-none lg:translate-x-0 lg:rounded-r-2xl lg:shadow-sm ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-3 pt-4 pb-2 flex-shrink-0 sm:px-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57] sm:w-3 sm:h-3 shadow-sm" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e] sm:w-3 sm:h-3 shadow-sm" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#28c840] sm:w-3 sm:h-3 shadow-sm" />
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="p-2 -mr-1 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden transition-colors"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="p-3 pt-2 space-y-1.5 overflow-y-auto flex-1 min-h-0 sm:p-4" aria-label="Main navigation">
          {sidebarNavItems.map((item, index) => {
            const isNavActive =
              (item.id === "chat" && activeView === "chat") ||
              (item.id === "connection" && activeView === "connection") ||
              (item.id === "viewraw" && activeView === "viewraw") ||
              (item.id === "history" && activeView === "history");
            const isNewChat = item.id === "newchat";
            return (
              <motion.button
                key={item.id}
                type="button"
                initial={reduceMotion ? false : { opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { delay: index * 0.055, type: "spring", stiffness: 320, damping: 28 }
                }
                whileHover={
                  reduceMotion
                    ? {}
                    : { x: 5, transition: { type: "spring", stiffness: 400, damping: 22 } }
                }
                whileTap={reduceMotion ? {} : { scale: 0.98 }}
                onClick={() => {
                  if (item.id === "newchat") handleNewChat();
                  setActiveView(item.id === "newchat" ? "chat" : item.id);
                  if (window.innerWidth < SIDEBAR_BREAKPOINT) setSidebarOpen(false);
                }}
                className={`relative w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-sm font-semibold min-h-[44px] sm:px-4 overflow-hidden transition-colors ${
                  isNewChat
                    ? "mt-1 border-2 border-dashed border-emerald-300/90 text-emerald-700 bg-emerald-50/40 hover:bg-emerald-50 hover:border-emerald-400 shadow-sm"
                    : isNavActive
                      ? "text-white shadow-md shadow-emerald-600/15"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/90"
                }`}
              >
                {!isNewChat && isNavActive ? (
                  <motion.span
                    layoutId="dashboardSidebarActivePill"
                    className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#00c9a7] via-[#00a78e] to-[#008f7a] z-0"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                ) : null}
                <span className="relative z-10 flex items-center gap-3 min-w-0">
                  <span className="flex-shrink-0">
                    <SidebarIcon d={item.icon} />
                  </span>
                  <span className="truncate">{item.label}</span>
                </span>
              </motion.button>
            );
          })}
        </nav>
        <div className="flex-shrink-0 h-16 px-3 flex items-center border-t border-slate-200 sm:px-4 bg-slate-50/50">
          <motion.button
            type="button"
            onClick={handleSignOut}
            whileHover={reduceMotion ? {} : { x: 4 }}
            whileTap={reduceMotion ? {} : { scale: 0.98 }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-md hover:shadow-slate-200/80 border border-transparent hover:border-slate-200 transition-all duration-300 min-h-[48px] sm:px-4"
          >
            <SidebarIcon d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            Sign Out
          </motion.button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <header className="flex items-center justify-between gap-3 px-3 py-3 border-b border-slate-200/80 bg-white/80 backdrop-blur-md sm:px-4 sm:py-4 md:px-6 lg:justify-end lg:px-8">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-1 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <img src="/image.png" alt="Logo" className="h-8 w-auto object-contain sm:h-9" />
        </header>

        {/* Main content: Chat, Connection or History */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#f5f7fb]">
          {activeView === "connection" ? (
            <div className="flex-1 overflow-auto flex flex-col min-h-0 px-3 py-6 sm:px-4 md:px-6 lg:px-8">
              <div className="max-w-4xl mx-auto w-full" ref={connectionFormRef}>
                <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 mb-1">Connection</h2>
                <p className="text-slate-600 text-sm mb-6">Manage your database and API connections here.</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  {/* Left card — name & type */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 flex flex-col gap-4 shadow-sm shadow-slate-200/40">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700 mb-2 block">Connection Name</span>
                      <input
                        type="text"
                        value={connectionName}
                        onChange={(e) => setConnectionName(e.target.value)}
                        placeholder="e.g. Production DB"
                        className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-[#00a078] focus:ring-2 focus:ring-[#00a078]/15 transition"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700 mb-2 block">Select Type</span>
                      <select
                        value={connectionType}
                        onChange={(e) => setConnectionType(e.target.value)}
                        className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm outline-none focus:border-[#00a078] focus:ring-2 focus:ring-[#00a078]/15 transition appearance-none cursor-pointer"
                        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 0.75rem center", backgroundSize: "1.25rem", paddingRight: "2.5rem" }}
                      >
                        <option value="">Choose database type</option>
                        <option value="mysql">MySQL</option>
                        <option value="postgres">Postgres</option>
                        <option value="oracle">Oracle</option>
                        <option value="mongodb">MongoDB</option>
                      </select>
                    </label>
                  </div>
                  {/* Right card — type-specific details */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 flex flex-col gap-4 shadow-sm shadow-slate-200/40">
                    {connectionType ? (
                      (CONNECTION_TYPE_FIELDS[connectionType] || []).map((fieldKey) => (
                        <label key={fieldKey} className="block">
                          <span className="text-sm font-medium text-slate-700 mb-2 block">{FIELD_LABELS[fieldKey]}</span>
                          <input
                            type={fieldKey === "password" ? "password" : "text"}
                            value={connectionDetails[fieldKey] ?? ""}
                            onChange={(e) => setConnectionDetail(fieldKey, e.target.value)}
                            placeholder={
                              fieldKey === "port"
                                ? "e.g. 3306"
                                : fieldKey === "database"
                                  ? "e.g. mydb"
                                  : fieldKey === "connectionUri"
                                    ? "mongodb+srv://user:password@cluster0.xxx.mongodb.net/db?retryWrites=true&w=majority"
                                    : ""
                            }
                            className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-[#00a078] focus:ring-2 focus:ring-[#00a078]/15 transition"
                          />
                        </label>
                      ))
                    ) : (
                      <p className="text-slate-500 text-sm">Select a database type to see connection details.</p>
                    )}
                  </div>
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveConnection}
                    disabled={!connectionName.trim() || !connectionType}
                    className="h-11 px-6 rounded-xl bg-[#00a78e] text-white font-medium text-sm hover:bg-[#009580] active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none shadow-md shadow-emerald-600/20"
                  >
                    {editingConnectionId ? "Update" : "Save"}
                  </button>
                </div>
                {savedConnections.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-slate-200">
                    <h3 className="text-base font-semibold text-slate-900 mb-3">Saved connections</h3>
                    <ul className="space-y-2">
                      {savedConnections.map((conn) => (
                        <li
                          key={conn.id}
                          className="flex items-center justify-between gap-3 py-3 px-4 rounded-xl bg-white border border-slate-200 shadow-sm"
                        >
                          <div className="min-w-0">
                            <p className="text-slate-900 font-medium truncate">{conn.name}</p>
                            <p className="text-slate-500 text-xs capitalize">{conn.type}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {!connectedConnectionIds.has(conn.id) && (
                              <button
                                type="button"
                                onClick={() => handleEditConnection(conn)}
                                className="h-9 px-4 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition"
                              >
                                Edit
                              </button>
                            )}
                            {connectedConnectionIds.has(conn.id) ? (
                              <span className="h-9 px-4 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-medium flex items-center">
                                Connected
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleConnect(conn)}
                                className="h-9 px-4 rounded-lg bg-[#00a78e] text-white text-sm font-medium hover:bg-[#009580] active:scale-[0.98] transition shadow-sm"
                              >
                                Connect
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteConnection(conn)}
                              className="h-9 px-4 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition"
                              aria-label="Delete connection"
                            >
                              Delete
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : activeView === "viewraw" ? (
            <div className="flex-1 overflow-auto flex flex-col min-h-0 px-3 py-6 sm:px-4 md:px-6 lg:px-8">
              <div className="max-w-[1600px] mx-auto w-full flex flex-col min-h-0 flex-1">
                <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 mb-1">View Raw</h2>
                <p className="text-slate-600 text-sm mb-4">
                  Use the panel on the right to pick connection, database (MongoDB), then table or collection.
                </p>
                {connectedConnections.length === 0 && (
                  <p className="text-slate-500 text-sm mb-4">Connect a database from the Connection tab first.</p>
                )}
                <div className="flex flex-col-reverse lg:flex-row gap-4 flex-1 min-h-0 items-start">
                  {/* Main: data preview (left on desktop) */}
                  <div className="flex-1 min-w-0 min-h-[280px] w-full">
                    {!rawSelectedConn ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-10 sm:p-14 text-center text-slate-500 text-sm">
                        Pick a <span className="text-slate-700 font-medium">connection</span> on the right →
                      </div>
                    ) : !rawSelectedTable ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-10 sm:p-14 text-center text-slate-500 text-sm">
                        {rawSelectedConn.type === "mongodb" && rawMongoDatabases.length > 0 && !rawMongoDb
                          ? "Choose a MongoDB database, then a collection from the right."
                          : rawTablesLoading
                            ? "Loading tables…"
                            : rawTables.length === 0
                              ? rawTablesError || (rawSelectedConn.type === "mongodb" ? "No collections." : "No tables.")
                              : `Choose a ${rawSelectedConn.type === "mongodb" ? "collection" : "table"} from the dropdown on the right.`}
                      </div>
                    ) : (
                        <>
                          {rawSelectedConn.type === "mongodb" ? (
                            <div className="space-y-4">
                              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-md shadow-slate-200/50">
                                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
                                  <div>
                                    <h3 className="text-base font-semibold text-slate-900 tracking-tight">{rawSelectedTable}</h3>
                                    <p className="text-[11px] text-slate-500 mt-0.5 uppercase tracking-wider">
                                      MongoDB · collection · table view (top-level fields)
                                    </p>
                                  </div>
                                  {!rawTableLoading && !rawTableError && rawTableData.columns.length > 0 && (
                                    <div className="flex gap-3 text-xs">
                                      <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-slate-700 border border-emerald-100">
                                        <span className="text-[#00a078] font-semibold">{rawTableData.columns.length}</span> fields
                                      </span>
                                      <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-slate-700 border border-emerald-100">
                                        <span className="text-[#00a078] font-semibold">{rawTableData.rows?.length ?? 0}</span> documents
                                      </span>
                                    </div>
                                  )}
                                </div>
                                {rawTableLoading ? (
                                  <div className="p-12 flex justify-center">
                                    <div className="w-8 h-8 border-2 border-[#00a78e] border-t-transparent rounded-full animate-spin" />
                                  </div>
                                ) : rawTableError ? (
                                  <p className="p-6 text-red-600 text-sm">{rawTableError}</p>
                                ) : rawTableData.columns.length === 0 ? (
                                  <p className="p-6 text-slate-500 text-sm">No documents in this collection.</p>
                                ) : (
                                  <div className="overflow-auto max-h-[min(70vh,560px)]">
                                    <table className="w-full text-sm border-collapse min-w-max">
                                      <thead>
                                        <tr className="sticky top-0 z-20 shadow-[0_1px_0_0_rgba(15,23,42,0.08)]">
                                          {rawTableData.columns.map((col) => (
                                            <th
                                              key={col.name}
                                              className="text-left align-bottom bg-slate-100 border-b border-r border-slate-200 last:border-r-0 px-3 py-2.5 min-w-[7rem] max-w-[22rem]"
                                            >
                                              <div className="font-semibold text-slate-900 text-[13px] leading-snug break-words">{col.name}</div>
                                              <div className="text-[10px] text-slate-500 font-mono mt-1 leading-tight break-all opacity-90">{col.type}</div>
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(rawTableData.rows ?? []).length === 0 ? (
                                          <tr>
                                            <td
                                              colSpan={Math.max(rawTableData.columns.length, 1)}
                                              className="px-4 py-8 text-center text-slate-500 text-sm border-b border-slate-100"
                                            >
                                              No rows (unexpected).
                                            </td>
                                          </tr>
                                        ) : (
                                          (rawTableData.rows ?? []).map((row, i) => (
                                            <tr
                                              key={i}
                                              className={`border-b border-slate-100 transition-colors hover:bg-emerald-50/40 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/70"}`}
                                            >
                                              {row.map((cell, j) => (
                                                <td
                                                  key={j}
                                                  className="align-top px-3 py-2 border-r border-slate-100 last:border-r-0 text-[13px] max-w-[22rem]"
                                                  title={cell != null ? String(cell) : ""}
                                                >
                                                  {cell == null ? (
                                                    <span className="text-slate-400 italic text-xs">—</span>
                                                  ) : (
                                                    <span className="font-mono text-slate-800 break-words whitespace-pre-wrap">{String(cell)}</span>
                                                  )}
                                                </td>
                                              ))}
                                            </tr>
                                          ))
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                                {!rawTableLoading && !rawTableError && (rawTableData.rows?.length ?? 0) > 0 && (
                                  <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500">
                                    Nested objects/arrays shown as JSON strings · up to 1000 documents · ObjectId/Date as extended JSON in cells where applicable
                                  </div>
                                )}
                              </div>
                              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                <button
                                  type="button"
                                  onClick={() => setRawMongoShowJson((v) => !v)}
                                  className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50 transition"
                                >
                                  <span>Full documents (JSON)</span>
                                  <span className="text-slate-500 text-xs">{rawMongoShowJson ? "Hide ▲" : "Show ▼"}</span>
                                </button>
                                {rawMongoShowJson && Array.isArray(rawTableData.documents) && rawTableData.documents.length > 0 && (
                                  <div className="px-4 pb-4 space-y-3 max-h-[24rem] overflow-y-auto border-t border-slate-200 pt-3">
                                    {rawTableData.documents.map((doc, idx) => (
                                      <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                                        <div className="px-3 py-1.5 text-xs text-slate-500 border-b border-slate-200 bg-white">Document {idx + 1}</div>
                                        <pre className="p-3 text-xs font-mono text-emerald-800 whitespace-pre-wrap break-words overflow-x-auto leading-relaxed">
                                          {JSON.stringify(doc, null, 2)}
                                        </pre>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-md shadow-slate-200/50">
                              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
                                <div>
                                  <h3 className="text-base font-semibold text-slate-900 tracking-tight">{rawSelectedTable}</h3>
                                  <p className="text-[11px] text-slate-500 mt-0.5 uppercase tracking-wider">
                                    {rawSelectedConn.type === "mysql" && "MySQL"}
                                    {(rawSelectedConn.type === "postgres" || rawSelectedConn.type === "postgresql") && "PostgreSQL"}
                                    {(rawSelectedConn.type === "oracle" || rawSelectedConn.type === "Oracle") && "Oracle"}
                                    {" · "}
                                    structure + data (one view)
                                  </p>
                                </div>
                                {!rawTableLoading && !rawTableError && rawTableData.columns.length > 0 && (
                                  <div className="flex gap-3 text-xs">
                                    <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-slate-700 border border-emerald-100">
                                      <span className="text-[#00a078] font-semibold">{rawTableData.columns.length}</span> columns
                                    </span>
                                    <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-slate-700 border border-emerald-100">
                                      <span className="text-[#00a078] font-semibold">{rawTableData.rows.length}</span> rows
                                    </span>
                                  </div>
                                )}
                              </div>
                              {rawTableLoading ? (
                                <div className="p-12 flex justify-center">
                                  <div className="w-8 h-8 border-2 border-[#00a78e] border-t-transparent rounded-full animate-spin" />
                                </div>
                              ) : rawTableError ? (
                                <p className="p-6 text-red-600 text-sm">{rawTableError}</p>
                              ) : rawTableData.columns.length === 0 ? (
                                <p className="p-6 text-slate-500 text-sm">No columns returned for this table.</p>
                              ) : (
                                <div className="overflow-auto max-h-[min(70vh,560px)]">
                                  <table className="w-full text-sm border-collapse min-w-max">
                                    <thead>
                                      <tr className="sticky top-0 z-20 shadow-[0_1px_0_0_rgba(15,23,42,0.08)]">
                                        {rawTableData.columns.map((col) => (
                                          <th
                                            key={col.name}
                                            className="text-left align-bottom bg-slate-100 border-b border-r border-slate-200 last:border-r-0 px-3 py-2.5 min-w-[7rem] max-w-[18rem]"
                                          >
                                            <div className="font-semibold text-slate-900 text-[13px] leading-snug break-words">{col.name}</div>
                                            <div className="text-[10px] text-slate-500 font-mono mt-1 leading-tight break-all opacity-90">{col.type}</div>
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rawTableData.rows.length === 0 ? (
                                        <tr>
                                          <td
                                            colSpan={Math.max(rawTableData.columns.length, 1)}
                                            className="px-4 py-8 text-center text-slate-500 text-sm border-b border-slate-100"
                                          >
                                            Table has no rows (structure shown above).
                                          </td>
                                        </tr>
                                      ) : (
                                        rawTableData.rows.map((row, i) => (
                                          <tr
                                            key={i}
                                            className={`border-b border-slate-100 transition-colors hover:bg-emerald-50/40 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/70"}`}
                                          >
                                            {row.map((cell, j) => (
                                              <td
                                                key={j}
                                                className="align-top px-3 py-2 border-r border-slate-100 last:border-r-0 text-[13px] max-w-[20rem]"
                                                title={cell != null ? String(cell) : ""}
                                              >
                                                {cell == null ? (
                                                  <span className="text-slate-400 italic text-xs">NULL</span>
                                                ) : (
                                                  <span className="font-mono text-slate-800 break-words whitespace-pre-wrap">{String(cell)}</span>
                                                )}
                                              </td>
                                            ))}
                                          </tr>
                                        ))
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {!rawTableLoading && !rawTableError && rawTableData.rows.length > 0 && (
                                <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500">
                                  Showing up to 1000 rows · column name + SQL type in header
                                </div>
                              )}
                            </div>
                          )}
                        </>
                    )}
                  </div>

                  <aside
                    className="w-full lg:w-[min(100%,320px)] shrink-0 bg-white border border-slate-200 rounded-2xl p-4 space-y-4 shadow-md shadow-slate-200/50 lg:sticky lg:top-6 self-start"
                    aria-label="Database and table selection"
                  >
                    <p className="text-xs font-semibold text-[#00a078] uppercase tracking-wider border-b border-slate-200 pb-2">
                      Connection &amp; data
                    </p>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700 mb-2 block">Connection</span>
                      <select
                        value={rawSelectedConn?.id ?? ""}
                        onChange={(e) => {
                          const id = e.target.value;
                          const conn = connectedConnections.find((c) => c.id === id) ?? null;
                          handleRawSelectConnection(conn);
                        }}
                        className="w-full h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm outline-none focus:border-[#00a078] focus:ring-2 focus:ring-[#00a078]/15 transition appearance-none cursor-pointer"
                        style={{
                          backgroundImage:
                            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E\")",
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "right 0.65rem center",
                          backgroundSize: "1.1rem",
                          paddingRight: "2.25rem",
                        }}
                      >
                        <option value="">Choose connection…</option>
                        {connectedConnections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.type})
                          </option>
                        ))}
                      </select>
                    </label>

                    {rawSelectedConn?.type === "mongodb" && rawMongoDatabases.length > 0 && (
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700 mb-2 block">Database</span>
                        <select
                          value={rawMongoDb}
                          onChange={(e) => handleRawMongoDatabasePick(e.target.value)}
                          className="w-full h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm outline-none focus:border-[#00a078] focus:ring-2 focus:ring-[#00a078]/15 transition appearance-none cursor-pointer"
                          style={{
                            backgroundImage:
                              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E\")",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "right 0.65rem center",
                            backgroundSize: "1.1rem",
                            paddingRight: "2.25rem",
                          }}
                        >
                          <option value="">Select database…</option>
                          {rawMongoDatabases.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                        <p className="text-slate-500 text-[11px] mt-1.5 leading-snug">URI has no default DB — pick one.</p>
                      </label>
                    )}
                    {rawSelectedConn?.type === "mongodb" && rawMongoDb && rawMongoDatabases.length === 0 && (
                      <p className="text-slate-500 text-xs">
                        DB: <span className="text-emerald-700 font-mono">{rawMongoDb}</span>
                      </p>
                    )}

                    {rawSelectedConn && (
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700 mb-2 block">
                          {rawSelectedConn.type === "mongodb" ? "Collection" : "Table"}
                        </span>
                        {rawSelectedConn.type === "mongodb" && rawMongoDatabases.length > 0 && !rawMongoDb ? (
                          <p className="text-slate-500 text-xs">Select a database first.</p>
                        ) : rawTablesLoading ? (
                          <p className="text-slate-500 text-sm py-2">Loading list…</p>
                        ) : rawTablesError ? (
                          <p className="text-red-600 text-xs">{rawTablesError}</p>
                        ) : rawTables.length === 0 ? (
                          <p className="text-slate-500 text-xs">
                            {rawSelectedConn.type === "mongodb" ? "No collections." : "No tables."}
                          </p>
                        ) : (
                          <select
                            value={rawSelectedTable ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v) handleRawSelectTable(v);
                              else {
                                setRawSelectedTable(null);
                                setRawMongoShowJson(false);
                                setRawTableData({ columns: [], rows: [], documents: null, format: null });
                                setRawTableError("");
                              }
                            }}
                            className="w-full h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm outline-none focus:border-[#00a078] focus:ring-2 focus:ring-[#00a078]/15 transition appearance-none cursor-pointer font-mono text-[13px]"
                            style={{
                              backgroundImage:
                                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E\")",
                              backgroundRepeat: "no-repeat",
                              backgroundPosition: "right 0.65rem center",
                              backgroundSize: "1.1rem",
                              paddingRight: "2.25rem",
                            }}
                          >
                            <option value="">
                              — Select {rawSelectedConn.type === "mongodb" ? "collection" : "table"} —
                            </option>
                            {rawTables.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        )}
                      </label>
                    )}
                  </aside>
                </div>
              </div>
            </div>
          ) : activeView === "history" ? (
            <div className="flex-1 overflow-auto flex flex-col min-h-0 px-3 py-6 sm:px-4 md:px-6 lg:px-8">
              <div className="max-w-2xl mx-auto w-full">
                <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 mb-1">History</h2>
                <p className="text-slate-600 text-sm mb-6">Open a past chat or start fresh with New Chat.</p>
                {historySessionsSorted.length === 0 ? (
                  <p className="text-slate-500 text-sm">No chats saved yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {historySessionsSorted.map((s) => {
                      const preview =
                        [...(s.messages || [])].reverse().find((m) => m.role === "user" && m.content)?.content ||
                        (s.messages?.length ? "Messages & previews" : "Empty chat");
                      const previewShort =
                        typeof preview === "string"
                          ? preview.replace(/\s+/g, " ").trim().slice(0, 72) + (preview.length > 72 ? "…" : "")
                          : "Chat";
                      const isActive = s.id === activeChatId;
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => handleOpenHistorySession(s.id)}
                            className={`w-full text-left rounded-2xl border px-4 py-3 transition min-h-[44px] ${
                              isActive
                                ? "border-emerald-300 bg-emerald-50 ring-2 ring-emerald-200/60 shadow-sm"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 shadow-sm"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-medium text-slate-900 text-sm truncate flex-1 min-w-0">{s.title || "Chat"}</span>
                              <span className="text-[11px] text-slate-500 flex-shrink-0 tabular-nums">
                                {formatHistoryTime(s.updatedAt)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-1 line-clamp-2">{previewShort}</p>
                            <p className="text-[10px] text-slate-500 mt-1.5">
                              {(s.messages?.length ?? 0)} message{(s.messages?.length ?? 0) === 1 ? "" : "s"}
                              {isActive ? " · Current" : ""}
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <>
          <div ref={scrollRef} className="flex-1 overflow-auto flex flex-col min-h-0">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-8 sm:py-12 min-h-0 w-full">
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.92, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 22 }}
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white border border-slate-200 shadow-lg shadow-emerald-500/10 flex items-center justify-center mb-4 sm:mb-6"
                >
                  <svg className="w-7 h-7 sm:w-8 sm:h-8 text-[#00a078]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </motion.div>
                <motion.h1
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduceMotion ? { duration: 0 } : { delay: 0.08, type: "spring", stiffness: 280, damping: 24 }}
                  className="text-xl sm:text-2xl md:text-3xl font-semibold text-slate-900 mb-2 text-center"
                >
                  {getGreeting()}
                </motion.h1>
                <motion.p
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduceMotion ? { duration: 0 } : { delay: 0.14, type: "spring", stiffness: 280, damping: 26 }}
                  className="text-slate-600 text-xs sm:text-sm md:text-base text-center max-w-md px-2"
                >
                  Connect a database (Postgres, MySQL, Oracle, MongoDB) in Connection, then ask about your data here. Use @ to pick a connection.
                </motion.p>
              </div>
            ) : (
              <div className="w-full px-3 py-4 space-y-3 sm:px-4 sm:py-6 sm:space-y-4 md:px-6 lg:px-8">
                {messages.map((msg, i) => (
                  <div
                    key={`${activeChatId}-${i}-${msg.role}-${msg.kind || "text"}`}
                    className={`flex min-w-0 ${msg.role === "user" ? "justify-end" : "justify-start w-full"}`}
                  >
                    <div
                      className={`rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 min-w-0 ${
                        msg.role === "user"
                          ? "max-w-[92%] sm:max-w-[min(85%,42rem)] bg-[#00a78e] text-white"
                          : "w-full max-w-full bg-white border border-slate-200 text-slate-800 shadow-sm"
                      }`}
                    >
                      {msg.kind === "data_preview" ? (
                        <DataPreviewMessage
                          title={msg.title}
                          subtitle={msg.subtitle}
                          columns={msg.columns}
                          rows={msg.rows}
                          footnote={msg.footnote}
                        />
                      ) : (
                        <p className="text-sm sm:text-base whitespace-pre-wrap break-words">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start w-full min-w-0">
                    <div className="w-full max-w-full bg-white border border-slate-200 rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-slate-500 text-sm shadow-sm">
                      Thinking...
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Chat input bar */}
          <div className="flex-shrink-0 px-3 pt-2 pb-4 sm:px-4 md:px-6 lg:px-8 safe-area-b border-t border-slate-200/80 bg-white/60 backdrop-blur-sm relative">
            {showAtSuggestions && atMode.mode === "connection" && atSuggestionsList.length > 0 && (
              <div
                className="absolute left-3 right-3 sm:left-4 sm:right-4 md:left-6 md:right-6 lg:left-8 lg:right-8 bottom-full mb-2 max-h-48 overflow-y-auto rounded-xl bg-white border border-slate-200 shadow-xl shadow-slate-300/40 py-1 z-10"
                role="listbox"
                aria-label="Connected connections"
              >
                <p className="px-4 py-2 text-xs text-slate-500 font-medium uppercase tracking-wider">Connected connections</p>
                {atSuggestionsList.map((conn, i) => (
                  <button
                    key={conn.id}
                    type="button"
                    role="option"
                    aria-selected={i === safeSelectedIndex}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition ${
                      i === safeSelectedIndex ? "bg-emerald-50 text-emerald-800" : "text-slate-700 hover:bg-slate-50"
                    }`}
                    onClick={() => selectConnectionForAt(conn)}
                  >
                    <span className="w-2 h-2 rounded-full bg-[#28c840] flex-shrink-0" aria-hidden />
                    {conn.name}
                  </button>
                ))}
              </div>
            )}
            {showAtSuggestions && atMode.mode === "table" && (
              <div
                className="absolute left-3 right-3 sm:left-4 sm:right-4 md:left-6 md:right-6 lg:left-8 lg:right-8 bottom-full mb-2 max-h-56 overflow-y-auto rounded-xl bg-white border border-slate-200 shadow-xl shadow-slate-300/40 py-1 z-10"
                role="listbox"
                aria-label="Tables and collections"
              >
                <p className="px-4 py-2 text-xs text-slate-500 font-medium uppercase tracking-wider">
                  {tablesLoading ? "Loading…" : (tableState?.needs_database ? "MongoDB databases" : "Tables / collections")}
                </p>
                {tablesLoading && (
                  <div className="px-4 py-3 text-sm text-slate-500">Loading list…</div>
                )}
                {!tablesLoading && tableSuggestionsList.length === 0 && (
                  <div className="px-4 py-3 text-sm text-slate-500">
                    {tableState?.needs_database ? "No databases found." : "No matches."}
                  </div>
                )}
                {!tablesLoading && tableSuggestionsList.map((item, i) => (
                  <button
                    key={`${item.kind}:${item.value}`}
                    type="button"
                    role="option"
                    aria-selected={i === safeTableSelectedIndex}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition ${
                      i === safeTableSelectedIndex ? "bg-emerald-50 text-emerald-800" : "text-slate-700 hover:bg-slate-50"
                    }`}
                    onClick={async () => {
                      const conn = atMode.activeConn;
                      if (!conn) return;
                      if (item.kind === "database") {
                        const dbName = item.value;
                        setMongoDbSelections((prev) => {
                          const next = new Map(prev);
                          next.set(conn.id, dbName);
                          return next;
                        });
                        replaceAtTokenWith(dbName);
                        const connWithDb = { ...conn, database: dbName };
                        await ensureTablesLoaded(connWithDb);
                        return;
                      }
                      if (item.kind === "table") {
                        const rememberedDb = (mongoDbSelections.get(conn.id) || "").trim();
                        const dbToUse = tableState?.database_used || (conn.database || "").trim() || rememberedDb || null;
                        replaceAtTokenWith(item.value);
                        await handlePickTableOrCollection(conn, item.value, dbToUse ? { database: dbToUse } : {});
                        setMessage("");
                        setCursorPosition(0);
                        setAtSuggestionsSelectedIndex(0);
                        setTableSuggestionsSelectedIndex(0);
                        return;
                      }
                    }}
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${item.kind === "database" ? "bg-[#febc2e]" : "bg-[#7dd3c0]"}`}
                      aria-hidden
                    />
                    <span className="font-mono text-[13px]">{item.value}</span>
                    <span className="ml-auto text-[10px] text-slate-400 uppercase tracking-wider">
                      {item.kind === "database" ? "db" : (atMode.activeConn?.type === "mongodb" ? "collection" : "table")}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {showAtSuggestions && atSuggestionsList.length === 0 && connectedConnections.length === 0 && (
              <div className="absolute left-3 right-3 sm:left-4 sm:right-4 md:left-6 md:right-6 lg:left-8 lg:right-8 bottom-full mb-2 rounded-xl bg-white border border-slate-200 shadow-xl shadow-slate-300/40 px-4 py-3 text-sm text-slate-600 z-10">
                No connected connections. Connect a connection from the Connection tab first.
              </div>
            )}
            <div className="w-full h-11 sm:h-12 flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 sm:px-5 shadow-md shadow-slate-200/60 focus-within:ring-2 focus-within:ring-[#00a078]/20 focus-within:border-[#00a078]/40 transition">
              <input
                ref={chatInputRef}
                type="text"
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  setCursorPosition(e.target.selectionStart ?? e.target.value.length);
                }}
                onSelect={(e) => setCursorPosition(e.target.selectionStart ?? 0)}
                onKeyDown={async (e) => {
                  if (showAtSuggestions && atMode.mode === "connection" && atSuggestionsList.length > 0) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setAtSuggestionsSelectedIndex((i) => (i + 1) % atSuggestionsList.length);
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setAtSuggestionsSelectedIndex((i) => (i - 1 + atSuggestionsList.length) % atSuggestionsList.length);
                      return;
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      selectConnectionForAt(atSuggestionsList[safeSelectedIndex]);
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      const newMsg = message.slice(0, lastAtIndex) + message.slice(cursorPosition);
                      setMessage(newMsg);
                      setCursorPosition(lastAtIndex);
                      setTimeout(() => chatInputRef.current?.setSelectionRange(lastAtIndex, lastAtIndex), 0);
                      return;
                    }
                  }
                  if (showAtSuggestions && atMode.mode === "table" && tableSuggestionsList.length > 0) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setTableSuggestionsSelectedIndex((i) => (i + 1) % tableSuggestionsList.length);
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setTableSuggestionsSelectedIndex((i) => (i - 1 + tableSuggestionsList.length) % tableSuggestionsList.length);
                      return;
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const item = tableSuggestionsList[safeTableSelectedIndex];
                      const conn = atMode.activeConn;
                      if (!conn || !item) return;
                      if (item.kind === "database") {
                        setMongoDbSelections((prev) => {
                          const next = new Map(prev);
                          next.set(conn.id, item.value);
                          return next;
                        });
                        replaceAtTokenWith(item.value);
                        const connWithDb = { ...conn, database: item.value };
                        await ensureTablesLoaded(connWithDb);
                        return;
                      }
                      if (item.kind === "table") {
                        const rememberedDb = (mongoDbSelections.get(conn.id) || "").trim();
                        const dbToUse = tableState?.database_used || (conn.database || "").trim() || rememberedDb || null;
                        replaceAtTokenWith(item.value);
                        await handlePickTableOrCollection(conn, item.value, dbToUse ? { database: dbToUse } : {});
                        setMessage("");
                        setCursorPosition(0);
                        setAtSuggestionsSelectedIndex(0);
                        setTableSuggestionsSelectedIndex(0);
                        return;
                      }
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      const newMsg = message.slice(0, lastAtIndex) + message.slice(cursorPosition);
                      setMessage(newMsg);
                      setCursorPosition(lastAtIndex);
                      setTimeout(() => chatInputRef.current?.setSelectionRange(lastAtIndex, lastAtIndex), 0);
                      return;
                    }
                  }
                  if (e.key === "Enter" && !e.shiftKey) handleSend();
                }}
                placeholder="Type your message... Use @ to pick a connected connection"
                className="flex-1 min-h-0 bg-transparent border-none outline-none text-slate-900 placeholder-slate-400 text-sm sm:text-base min-w-0"
                disabled={loading}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={loading || !message.trim()}
                className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#00a78e] hover:bg-[#009580] active:scale-95 flex items-center justify-center transition disabled:opacity-50 disabled:pointer-events-none touch-manipulation shadow-md shadow-emerald-600/25"
                aria-label="Send message"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
