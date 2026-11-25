import React from "react";
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
} from "lucide-react";
import { useAuth, UserRole } from "../context/AuthContext";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    to: "/",
    label: "Dashboard Hari Ini",
    icon: <LayoutDashboard className="w-4 h-4" />,
    roles: ["employee", "supervisor", "hr_admin", "it_admin"],
  },
  {
    to: "/employees",
    label: "Karyawan & Biometrik",
    icon: <Users className="w-4 h-4" />,
    roles: ["hr_admin", "it_admin", "supervisor"],
  },
  {
    to: "/attendance",
    label: "Log Absensi",
    icon: <ClipboardList className="w-4 h-4" />,
    roles: ["employee", "supervisor", "hr_admin", "it_admin"],
  },
  {
    to: "/corrections",
    label: "Koreksi Absen",
    icon: <FileEdit className="w-4 h-4" />,
    roles: ["employee", "supervisor", "hr_admin", "it_admin"],
  },
  {
    to: "/shifts",
    label: "Shift & Hari Libur",
    icon: <Clock className="w-4 h-4" />,
    roles: ["hr_admin", "it_admin"],
  },
  {
    to: "/reports",
    label: "Rekap & Ekspor",
    icon: <FileSpreadsheet className="w-4 h-4" />,
    roles: ["hr_admin", "it_admin", "supervisor"],
  },
  {
    to: "/admin-it",
    label: "Admin IT & Audit UU PDP",
    icon: <ShieldCheck className="w-4 h-4" />,
    roles: ["it_admin", "hr_admin"],
  },
];

const ROLE_LABELS: Record<UserRole, string> = {
  employee: "Karyawan",
  supervisor: "Atasan",
  hr_admin: "Admin HR",
  it_admin: "Admin IT",
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) return null;

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col shrink-0">
        <div className="p-5 border-b border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <ScanFace className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-sm leading-tight">Absensi Wajah</div>
            <div className="text-xs text-slate-400">OpenCV YuNet + SFace</div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {visibleNav.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  active
                    ? "bg-emerald-600 text-white font-medium"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}

          <div className="pt-4 mt-4 border-t border-slate-800">
            <Link
              to="/kiosk"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm bg-slate-800 text-emerald-300 hover:bg-slate-700 transition"
            >
              <Tablet className="w-4 h-4" />
              <span>Buka Mode Kiosk</span>
            </Link>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="text-sm font-medium truncate">{user.fullName}</div>
          <div className="text-xs text-slate-400 mb-3">
            {ROLE_LABELS[user.role]} · {user.nik}
          </div>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg bg-slate-800 hover:bg-rose-600/90 text-slate-200 transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-6 md:p-8 overflow-y-auto">{children}</main>
    </div>
  );
};
