import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ScanFace, Tablet } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("hr@kantor.local");
  const [password, setPassword] = useState("Admin123!");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal masuk");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
            <ScanFace className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Absensi Face Recognition</h1>
            <p className="text-xs text-slate-500">Dashboard HR · Atasan · Karyawan · Admin IT</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm border border-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Kantor</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition disabled:opacity-50 cursor-pointer"
          >
            {submitting ? "Memproses..." : "Masuk Dashboard"}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500">Tablet di pintu masuk?</span>
          <Link
            to="/kiosk"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            <Tablet className="w-4 h-4" />
            Buka Mode Kiosk
          </Link>
        </div>

        <div className="mt-5 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
          <div className="font-semibold text-slate-700">Akun Demo (Password: Admin123!):</div>
          <div>HR Admin: <code>hr@kantor.local</code></div>
          <div>Admin IT: <code>it@kantor.local</code></div>
          <div>Atasan: <code>atasan@kantor.local</code></div>
          <div>Karyawan: <code>karyawan@kantor.local</code> (PIN: 123456)</div>
        </div>
      </div>
    </div>
  );
};
