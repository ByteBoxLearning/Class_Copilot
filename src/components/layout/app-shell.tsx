"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut, ChevronDown, KeyRound, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from "./notification-bell";
import { ClassSwitcher, type SwitcherClass } from "./class-switcher";
import { logoutAction } from "@/actions/auth";
import { navFor } from "./nav-config";

const ROLE_LABEL: Record<string, string> = { OWNER: "Teacher", ADMIN: "Teacher", ASSISTANT: "Co-Teacher", CLIENT: "Student" };

export function AppShell({
  user,
  children,
  classes,
  currentClassId,
  brandName,
}: {
  user: { name: string; email: string; role: string };
  children: React.ReactNode;
  classes?: SwitcherClass[];
  currentClassId?: string | null;
  brandName?: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Choose nav on the client from the role, so no function/component icons
  // need to cross the server → client boundary.
  const nav = navFor(user.role);
  const roleLabel = ROLE_LABEL[user.role] ?? user.role;
  const showSwitcher = user.role !== "CLIENT" && classes && classes.length > 0;

  const isActive = (href: string) => pathname === href || pathname.startsWith(href);

  const NavLinks = () => (
    <nav className="flex flex-col gap-0.5 px-3">
      {nav.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-slate-600 hover:bg-accent hover:text-foreground",
            )}
          >
            {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-primary" />}
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const brand = brandName || "Class Copilot";
  const Brand = () => (
    <div className="flex items-center gap-2.5 px-5 py-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
        <GraduationCap className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-foreground">{brand}</p>
        <p className="text-[11px] text-slate-400">{user.role === "CLIENT" ? "Student portal" : "Classroom workspace"}</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-white lg:flex">
        <Brand />
        <div className="flex-1 py-2">
          <NavLinks />
        </div>
        <div className="border-t border-border p-3">
          <UserBox user={user} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-border bg-white">
            <div className="flex items-center justify-between">
              <Brand />
              <button onClick={() => setMobileOpen(false)} className="mr-3">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 py-2">
              <NavLinks />
            </div>
            <div className="border-t border-border p-3">
              <UserBox user={user} />
            </div>
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-white/90 px-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5 text-slate-600" />
            </button>
            <Badge color={user.role === "OWNER" ? "bg-primary text-primary-foreground border-primary" : user.role === "CLIENT" ? "bg-violet-100 text-violet-800 border-violet-200" : "bg-sky-100 text-sky-800 border-sky-200"}>
              {roleLabel}
            </Badge>
            {showSwitcher && <ClassSwitcher classes={classes!} currentClassId={currentClassId ?? null} />}
            <span className="hidden text-sm text-slate-500 md:inline">
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationBell />
            <UserMenu user={user} />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

// Top-right user menu with a clear "Sign out" action.
function UserMenu({ user }: { user: { name: string; email: string; role: string } }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = user.name.split(" ").map((n) => n[0]).slice(0, 2).join("");

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-accent"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
          {initials}
        </span>
        <span className="hidden text-sm font-medium text-slate-700 sm:inline">{user.name.split(" ")[0]}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-xl border border-border bg-white shadow-lg">
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-medium text-slate-800">{user.name}</p>
            <p className="truncate text-xs text-slate-400">{user.email}</p>
            <span className="mt-1 inline-block text-[11px] font-medium uppercase tracking-wide text-slate-400">
              {user.role === "OWNER" ? "Teacher" : user.role === "CLIENT" ? "Student" : "Co-Teacher"}
            </span>
          </div>
          <Link
            href="/change-password"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 border-b border-border px-4 py-2.5 text-left text-sm text-slate-600 hover:bg-accent"
          >
            <KeyRound className="h-4 w-4" /> Change password
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function UserBox({ user }: { user: { name: string; email: string } }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
        {user.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-[11px] text-slate-400">{user.email}</p>
      </div>
      <form action={logoutAction}>
        <button type="submit" className="rounded-md p-1.5 text-slate-400 hover:bg-accent hover:text-slate-600" title="Log out">
          <LogOut className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
