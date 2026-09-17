// API client. Wraps fetch, attaches the stored auth token, and exposes the
// operations the UI needs. Base URL is empty because Vite proxies /api.

const TOKEN_KEY = "roof_estimator_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = "GET", body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }

  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  login: (email) => request("/auth/login", { method: "POST", body: { email } }),
  signup: (payload) => request("/auth/signup", { method: "POST", body: payload }),
  me: () => request("/me"),
  listCompanies: () => request("/companies"),
  saveAccount: (payload) => request("/account", { method: "PUT", body: payload }),
  processEstimation: (payload) =>
    request("/processEstimationRequest", { method: "POST", body: payload }),
  getEstimation: (id) => request(`/estimation/${id}`),
  updateEstimation: (id, patch) => request(`/estimation/${id}`, { method: "PUT", body: patch }),
  sendEstimate: (id) => request(`/estimation/${id}/send`, { method: "POST" }),
  // PDF download must carry the auth header (drafts are company-only), so we
  // fetch it as a blob instead of using a plain <a href>.
  downloadPdf: async (id) => {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api/estimation/${id}/pdf`, { headers });
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch { /* no body */ }
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
    const blob = await res.blob();
    const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "");
    return { blob, filename: match?.[1] || `estimate-${id}.pdf` };
  },
  listLeads: () => request("/leads"),
  markViewed: (id) => request(`/leads/${id}/viewed`, { method: "POST" }),
  getSettings: () => request("/settings"),
  saveSettings: (settings) => request("/settings", { method: "PUT", body: settings }),
};
