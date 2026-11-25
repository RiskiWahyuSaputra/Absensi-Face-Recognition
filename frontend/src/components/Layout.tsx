import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  ScanFace,
  ClipboardList,
  FileEdit,
  Clock,
  FileSpreadsheet,
  ShieldCheck,
  Tablet,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useAuth, UserRole } from "../context/AuthContext";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

const ALL: UserRole[] = ["employee", "supervisor", "hr_admin", "it_admin"];

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Harian",
    items: [
      { to: "/", label: "Kehadiran Hari Ini", icon: LayoutDashboard, roles: ALL },
      { to: "/attendance", label: "Log Absensi", icon: ClipboardList, roles: ALL },
      { to: "/corrections", label: "Koreksi Absen", icon: FileEdit, roles: ALL },
    ],
  },
  {
    title: "Kelola",
    items: [
      {
        to: "/employees",
        label: "Karyawan & Wajah",
        icon: Users,
        roles: ["hr_admin", "it_admin", "supervisor"],
      },
      { to: "/shifts", label: "Shift & Hari Libur", icon: Clock, roles: ["hr_admin", "it_admin"] },
      {
        to: "/reports",
        label: "Rekap & Ekspor",
        icon: FileSpreadsheet,
        roles: ["hr_admin", "it_admin", "supervisor"],
      },
    ],
  },
  {
    title: "Sistem",
    items: [
      { to: "/admin-it", label: "Admin IT & Audit", icon: ShieldCheck, roles: ["it_admin", "hr_admin"] },
    ],
  },
];

const ROLE_LABELS: Record<UserRole, string> = {
  employee: "Karyawan",
  supervisor: "Atasan",
  hr_admin: "Admin HR",
  it_admin: "Admin IT",
};

function isActive(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");
}

const Brand: React.FC = () => (
  <div className="flex items-center gap-2.5">
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
      <ScanFace className="h-5 w-5" />
    </div>
    <div className="leading-tight">
      <div className="text-sm font-bold text-slate-900">Absensi Wajah</div>
      <div className="text-[11px] text-slate-500">Kehadiran karyawan</div>
    </div>
  </div>
);

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Tutup laci menu setiap pindah halaman
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  if (!user) return null;

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.roles.includes(user.role)),
  })).filter((g) => g.items.length > 0);

  const initials = user.fullName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Brand />
        <button
          onClick={() => setDrawerOpen(false)}
          aria-label="Tutup menu"
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Menu utama">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="mb-1.5 px-3 text-[11px] font-semibold text-slate-400">{g.title}</div>
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const active = isActive(location.pathname, item.to);
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors lg:py-2 ${
                        active
                          ? "bg-brand-50 font-semibold text-brand-800"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${active ? "text-brand-700" : "text-slate-400"}`} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-t border-slate-200 p-3">
        <Link
          to="/kiosk"
          className="flex items-center gap-3 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Tablet className="h-4 w-4" />
          Buka Mode Kiosk
        </Link>
        <div className="flex items-center gap-3 px-1">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-900">{user.fullName}</div>
            <div className="truncate text-xs text-slate-500">
              {ROLE_LABELS[user.role]} · {user.nik}
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            aria-label="Keluar"
            title="Keluar"
            className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-slate-50">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">
        {sidebar}
      </aside>

      {/* Bar atas ponsel/tablet */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:hidden">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Buka menu"
          aria-expanded={drawerOpen}
          className="-ml-2 rounded-lg p-2 text-slate-700 hover:bg-slate-100"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Brand />
        <Link
          to="/kiosk"
          aria-label="Buka mode kiosk"
          className="-mr-2 rounded-lg p-2 text-slate-700 hover:bg-slate-100"
        >
          <Tablet className="h-5 w-5" />
        </Link>
      </header>

      {/* Laci menu ponsel/tablet */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[min(18rem,85vw)] bg-white shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
};
