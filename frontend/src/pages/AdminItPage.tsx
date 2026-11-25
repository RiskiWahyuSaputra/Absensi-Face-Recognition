import React, { useEffect, useState } from "react";
import { ShieldAlert, Trash2, Plus, Activity } from "lucide-react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";

interface KioskRow {
  id: string;
  device_code: string;
  name: string;
  location: string;
  is_active: boolean;
  rate_limit_per_min: number;
  last_seen_at: string | null;
}

interface SettingRow {
  key: string;
  value: string;
  description: string;
}

interface AuditRow {
  id: string;
  action: string;
  actor_name: string | null;
  actor_role: string;
  target_employee_name: string | null;
  ip_address: string;
  created_at: string;
}

export const AdminItPage: React.FC = () => {
  const { user } = useAuth();
  const isItAdmin = user?.role === "it_admin";

  const [kiosks, setKiosks] = useState<KioskRow[]>([]);
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [faceHealth, setFaceHealth] = useState<Record<string, string>>({});
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [newTokenBanner, setNewTokenBanner] = useState("");
  const [kioskForm, setKioskForm] = useState({
    deviceCode: "",
    name: "",
    location: "",
    rateLimitPerMin: 60,
  });

  async function load() {
    const [kRes, sRes, aRes] = await Promise.all([
      apiFetch<{ kiosks: KioskRow[] }>("/admin/kiosks"),
      apiFetch<{ settings: SettingRow[]; faceServiceHealth: Record<string, string> }>(
        "/admin/settings"
      ),
      apiFetch<{ logs: AuditRow[] }>("/admin/biometric-audit-logs"),
    ]);
    setKiosks(kRes.kiosks);
    setSettings(sRes.settings);
    setFaceHealth(sRes.faceServiceHealth || {});
    setAuditLogs(aRes.logs);
  }

  useEffect(() => {
    load();
  }, []);

  async function createKiosk(e: React.FormEvent) {
    e.preventDefault();
    const res = await apiFetch<{ kioskToken: string }>("/admin/kiosks", {
      method: "POST",
      body: JSON.stringify({
        ...kioskForm,
        rateLimitPerMin: Number(kioskForm.rateLimitPerMin),
      }),
    });
    setNewTokenBanner(res.kioskToken);
    setKioskForm({ deviceCode: "", name: "", location: "", rateLimitPerMin: 60 });
    load();
  }

  async function revokeKiosk(id: string) {
    if (!window.confirm("Cabut token perangkat kiosk ini? Tablet tidak akan bisa mengirim absen.")) {
      return;
    }
    await apiFetch(`/admin/kiosks/${id}/revoke`, { method: "POST" });
    load();
  }

  async function updateSetting(key: string, currentVal: string) {
    const nextVal = window.prompt(`Masukkan nilai baru untuk "${key}":`, currentVal);
    if (!nextVal || nextVal === currentVal) return;
    await apiFetch(`/admin/settings/${key}`, {
      method: "PUT",
      body: JSON.stringify({ value: nextVal }),
    });
    load();
  }

  async function triggerCleanup() {
    const res = await apiFetch<{ deletedCount: number; retentionDays: number }>(
      "/admin/cleanup-proof-photos",
      { method: "POST" }
    );
    alert(`Pembersihan selesai: ${res.deletedCount} foto > ${res.retentionDays} hari dihapus.`);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin IT, Perangkat Kiosk &amp; Audit UU PDP</h1>
          <p className="text-sm text-slate-500">
            Kelola token kiosk, ambang kecocokan SFace, retensi foto 90 hari, dan log akses data biometrik.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600" />
            Face Service: <strong>{faceHealth.status || "unknown"}</strong> (
            {faceHealth.detector || "-"} / {faceHealth.recognizer || "-"})
          </div>
          {isItAdmin && (
            <button
              onClick={triggerCleanup}
              className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Bersihkan Foto &gt; 90 Hari
            </button>
          )}
        </div>
      </div>

      {newTokenBanner && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-sm">
          <div className="font-bold">Token Kiosk Baru (hanya ditampilkan sekali!):</div>
          <code className="block mt-1 p-2 bg-white rounded border border-amber-200 select-all">
            {newTokenBanner}
          </code>
        </div>
      )}

      {/* Perangkat Kiosk */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-800">Perangkat Tablet Kiosk</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-2.5">Kode &amp; Nama</th>
                <th className="px-4 py-2.5">Lokasi</th>
                <th className="px-4 py-2.5">Rate Limit</th>
                <th className="px-4 py-2.5">Terakhir Aktif</th>
                <th className="px-4 py-2.5">Status</th>
                {isItAdmin && <th className="px-4 py-2.5 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {kiosks.map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{k.name}</div>
                    <div className="text-xs text-slate-500">{k.device_code}</div>
                  </td>
                  <td className="px-4 py-2.5">{k.location}</td>
                  <td className="px-4 py-2.5 text-xs">{k.rate_limit_per_min}/menit</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {k.last_seen_at ? new Date(k.last_seen_at).toLocaleString("id-ID") : "Belum pernah"}
                  </td>
                  <td className="px-4 py-2.5">
                    {k.is_active ? (
                      <span className="text-xs font-medium text-emerald-700">Aktif</span>
                    ) : (
                      <span className="text-xs font-medium text-rose-700">Dicabut</span>
                    )}
                  </td>
                  {isItAdmin && (
                    <td className="px-4 py-2.5 text-right">
                      {k.is_active && (
                        <button
                          onClick={() => revokeKiosk(k.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 text-xs cursor-pointer"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" /> Cabut Token
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isItAdmin && (
          <form onSubmit={createKiosk} className="pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              required
              placeholder="Kode (mis. KIOSK-02)"
              value={kioskForm.deviceCode}
              onChange={(e) => setKioskForm({ ...kioskForm, deviceCode: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <input
              required
              placeholder="Nama Perangkat"
              value={kioskForm.name}
              onChange={(e) => setKioskForm({ ...kioskForm, name: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <input
              required
              placeholder="Lokasi Pintu"
              value={kioskForm.location}
              onChange={(e) => setKioskForm({ ...kioskForm, location: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Buat Token Kiosk
            </button>
          </form>
        )}
      </div>

      {/* Pengaturan Ambang Kecocokan */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h2 className="font-semibold text-slate-800">Pengaturan Ambang Kecocokan &amp; Aturan</h2>
        <div className="divide-y divide-slate-100">
          {settings.map((s) => (
            <div key={s.key} className="py-2.5 flex items-center justify-between gap-4 text-sm">
              <div>
                <div className="font-mono font-medium text-slate-800">{s.key}</div>
                <div className="text-xs text-slate-500">{s.description}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-emerald-700">{s.value}</span>
                {isItAdmin && (
                  <button
                    onClick={() => updateSetting(s.key, s.value)}
                    className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs cursor-pointer"
                  >
                    Ubah
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Log Akses Data Biometrik (UU PDP) */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 font-semibold text-slate-800">
          Log Audit Akses Data Biometrik (UU PDP No. 27/2022)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase">
              <tr>
                <th className="px-5 py-2.5">Waktu</th>
                <th className="px-5 py-2.5">Aktor</th>
                <th className="px-5 py-2.5">Aksi</th>
                <th className="px-5 py-2.5">Target Karyawan</th>
                <th className="px-5 py-2.5">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.map((l) => (
                <tr key={l.id}>
                  <td className="px-5 py-2.5 font-mono">
                    {new Date(l.created_at).toLocaleString("id-ID")}
                  </td>
                  <td className="px-5 py-2.5">
                    {l.actor_name || "Sistem"} ({l.actor_role})
                  </td>
                  <td className="px-5 py-2.5 font-mono font-medium">{l.action}</td>
                  <td className="px-5 py-2.5">{l.target_employee_name || "-"}</td>
                  <td className="px-5 py-2.5 font-mono">{l.ip_address}</td>
                </tr>
              ))}
              {auditLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-slate-400">
                    Belum ada catatan audit biometrik.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
