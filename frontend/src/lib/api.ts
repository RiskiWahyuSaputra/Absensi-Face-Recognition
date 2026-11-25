const API_BASE = "/api";

export function getAuthToken(): string | null {
  return localStorage.getItem("absensi_jwt");
}

export function setAuthToken(token: string | null): void {
  if (token) localStorage.setItem("absensi_jwt", token);
  else localStorage.removeItem("absensi_jwt");
}

export function getKioskToken(): string {
  return localStorage.getItem("absensi_kiosk_token") || "kiosk_demo_pintu_utama_2026";
}

export function setKioskToken(token: string): void {
  localStorage.setItem("absensi_kiosk_token", token.trim());
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request gagal (${res.status})`);
  }
  return data as T;
}

export async function kioskFetch<T>(
  path: string,
  options: RequestInit = {},
  overrideToken?: string
): Promise<{ ok: boolean; status: number; data: T & { error?: string; code?: string } }> {
  const token = overrideToken || getKioskToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-kiosk-token": token,
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function downloadProtectedFile(path: string, filename: string): Promise<void> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error("Gagal mengunduh file");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
