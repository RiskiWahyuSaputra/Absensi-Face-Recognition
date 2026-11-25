import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ScanFace, ShieldCheck, Tablet, WifiOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Alert } from "../components/ui";

const DEMO_ACCOUNTS = [
  { role: "Admin HR", email: "hr@kantor.local" },
  { role: "Admin IT", email: "it@kantor.local" },
  { role: "Atasan", email: "atasan@kantor.local" },
  { role: "Karyawan", email: "karyawan@kantor.local", note: "PIN 123456" },
];
const DEMO_PASSWORD = "Admin123!";

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("hr@kantor.local");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      {/* Panel informasi (desktop) */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 p-10 text-white lg:flex xl:p-14">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600">
            <ScanFace className="h-5 w-5" />
          </div>
          <span className="text-base font-bold">Absensi Wajah</span>
        </div>

        <div className="max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
            Absen cukup dengan wajah, rekap langsung siap untuk HR.
          </h2>
          <ul className="mt-8 space-y-4 text-sm text-slate-300">
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
              Hanya vektor wajah terenkripsi yang disimpan, sesuai UU PDP No. 27/2022.
            </li>
            <li className="flex gap-3">
              <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
              Kiosk tetap mencatat saat internet putus, lalu mengirim otomatis.
            </li>
            <li className="flex gap-3">
              <Tablet className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
              Karyawan yang menolak biometrik tetap bisa absen dengan PIN + foto.
            </li>
          </ul>
        </div>

        <p className="text-xs text-slate-500">Dashboard HR · Atasan · Karyawan · Admin IT</p>
      </aside>

      {/* Formulir */}
      <main className="flex items-center justify-center bg-white px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-700 text-white">
              <ScanFace className="h-5 w-5" />
            </div>
            <span className="text-base font-bold">Absensi Wajah</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Masuk ke dashboard</h1>
          <p className="mt-1.5 text-sm text-slate-500">Gunakan email kantor dan password kamu.</p>

          {error && (
            <div className="mt-6">
              <Alert tone="error">{error}</Alert>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="field-label">
                Email kantor
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="password" className="field-label">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={submitting} className="btn btn-primary w-full">
              {submitting ? "Memproses..." : "Masuk"}
            </button>
          </form>

          <div className="mt-8 rounded-xl border border-slate-200 p-4">
            <div className="text-xs font-semibold text-slate-700">
              Akun demo · password <code className="font-mono">{DEMO_PASSWORD}</code>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(DEMO_PASSWORD);
                  }}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    email === a.email
                      ? "border-brand-600 bg-brand-50"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="font-semibold text-slate-900">{a.role}</div>
                  <div className="truncate text-slate-500">{a.note || a.email}</div>
                </button>
              ))}
            </div>
          </div>

          <Link
            to="/kiosk"
            className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-brand-700 hover:text-brand-800"
          >
            <Tablet className="h-4 w-4" />
            Buka mode kiosk untuk tablet pintu masuk
          </Link>
        </div>
      </main>
    </div>
  );
};
