/**
 * API client for SynDb backend.
 * In dev, use relative URL so Vite proxy forwards /api to Django (no CORS). Override with VITE_API_URL if needed.
 */
const API_BASE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";

export const AUTH_TOKEN_KEY = "syndb_auth_token";

export function getStoredToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setStoredToken(token) {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Login with email and password. Stores token on success.
 * @returns {Promise<{ ok: true, user: object } | { ok: false, error: string }>}
 */
export async function loginWithEmailPassword(email, password) {
  const res = await fetch(`${API_BASE}/api/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email ?? "", password: password ?? "" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error ?? "Login failed." };
  }
  if (data.token) setStoredToken(data.token);
  return { ok: true, user: data.user ?? {} };
}

/**
 * Register with email and password. Stores token on success.
 * @returns {Promise<{ ok: true, user: object } | { ok: false, error: string }>}
 */
export async function registerWithEmailPassword(email, password) {
  const res = await fetch(`${API_BASE}/api/auth/register/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email ?? "", password: password ?? "" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error ?? "Registration failed." };
  }
  if (data.token) setStoredToken(data.token);
  return { ok: true, user: data.user ?? {} };
}

export async function logoutApi() {
  const token = getStoredToken();
  if (token) {
    await fetch(`${API_BASE}/api/auth/logout/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${token}`,
      },
    }).catch(() => {});
  }
  setStoredToken("");
}

/**
 * Verify database connection with given credentials.
 * @param {Object} conn - { type, host, port, username, password, database, service, connectionUri }
 * @returns {Promise<{ connected: boolean, message: string, db_type: string }>}
 */
export async function verifyCredentials(conn) {
  const payload = {
    type: conn.type,
    host: conn.host ?? "",
    port: conn.port ?? "",
    username: conn.username ?? "",
    password: conn.password ?? "",
    database: conn.database ?? "",
    service: conn.service ?? "",
    connectionUri: conn.connectionUri ?? "",
  };
  const res = await fetch(`${API_BASE}/api/credentials/verify/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      connected: false,
      message: data.message ?? "Not Connected",
      db_type: data.db_type ?? conn.type ?? "unknown",
      error_detail: data.error_detail ?? data.error,
    };
  }
  return {
    connected: Boolean(data.connected),
    message: data.message ?? (data.connected ? "Connected (Real DB)" : "Not Connected"),
    db_type: data.db_type ?? conn.type ?? "unknown",
    error_detail: data.error_detail,
  };
}

/**
 * Send a chat question with the given connection.
 * @param {string} question - The user question
 * @param {Object} connection - Saved connection object (id, name, type, host, port, etc.)
 * @returns {Promise<{ answer?: string, error?: string }>}
 */
export async function sendChat(question, connection) {
  const res = await fetch(`${API_BASE}/api/chat/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: question ?? "",
      connection: connection ?? {},
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      error: data.error ?? data.message ?? "Request failed. Try again.",
    };
  }
  return {
    answer: data.answer ?? data.response ?? "",
    error: data.error ?? null,
  };
}

/**
 * List tables/collections for a connection (raw view).
 * @param {Object} connection - Saved connection object
 * @returns {Promise<{ tables?: string[], error?: string }>}
 */
export async function fetchRawTables(connection) {
  const res = await fetch(`${API_BASE}/api/raw/tables/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connection: connection ?? {} }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: data.error ?? "Failed to fetch tables" };
  }
  if (data.error && !(data.needs_database && (data.databases?.length > 0))) {
    return { error: data.error };
  }
  return {
    tables: data.tables ?? [],
    needs_database: Boolean(data.needs_database),
    databases: data.databases ?? [],
    database_used: data.database_used ?? null,
  };
}

/**
 * Get table/collection structure (columns) and full data for a connection.
 * @param {Object} connection - Saved connection object
 * @param {string} tableName - Table or collection name
 * @returns {Promise<{ columns?: { name: string, type: string }[], rows?: any[][], error?: string }>}
 */
export async function fetchRawTable(connection, tableName) {
  const res = await fetch(`${API_BASE}/api/raw/table/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connection: connection ?? {}, table: tableName ?? "" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: data.error ?? "Failed to fetch table" };
  }
  if (data.error) {
    return { error: data.error };
  }
  return {
    columns: data.columns ?? [],
    rows: data.rows ?? [],
    format: data.format ?? null,
    documents: data.documents ?? null,
  };
}
