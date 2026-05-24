import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  Activity,
  BarChart3,
  ClipboardList,
  Settings,
  LogOut,
  Menu,
  X,
  CalendarRange,
  Gauge,
  CalendarDays,
  BookOpen,
  Users,
  Eraser,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!user) return <>{children}</>;

  const primaryNav = [
    {
      title: "Saisie du jour",
      href: "/entry",
      icon: <ClipboardList className="h-5 w-5" />,
      allowed: ["operator", "supervisor", "admin"],
    },
    {
      title: "Lots à valider",
      href: "/lots",
      icon: <ClipboardList className="h-5 w-5" />,
      allowed: ["supervisor", "admin"],
    },
    {
      title: "Tableau de bord",
      href: "/production",
      icon: <Gauge className="h-5 w-5" />,
      allowed: ["supervisor", "admin"],
    },
    {
      title: "Planning",
      href: "/planning",
      icon: <CalendarRange className="h-5 w-5" />,
      allowed: ["supervisor", "admin"],
    },
    {
      title: "Administration",
      href: "/admin",
      icon: <Settings className="h-5 w-5" />,
      allowed: ["admin"],
    },
  ];

  const secondaryNav = [
    {
      title: "Revue / Corrections",
      href: "/supervisor",
      icon: <Activity className="h-5 w-5" />,
      allowed: ["supervisor", "admin"],
    },
    {
      title: "Fiches Journalières",
      href: "/daily-entries",
      icon: <BookOpen className="h-5 w-5" />,
      allowed: ["supervisor", "admin"],
    },
    {
      title: "Calendrier Annuel",
      href: "/calendar",
      icon: <CalendarDays className="h-5 w-5" />,
      allowed: ["supervisor", "admin"],
    },
    {
      title: "Analyse TRS",
      href: "/analysis",
      icon: <BarChart3 className="h-5 w-5" />,
      allowed: ["supervisor", "admin"],
    },
    {
      title: "Utilisateurs",
      href: "/users",
      icon: <Users className="h-5 w-5" />,
      allowed: ["admin"],
    },
    {
      title: "Nettoyage",
      href: "/cleanup",
      icon: <Eraser className="h-5 w-5" />,
      allowed: ["admin"],
    },
  ];

  const visiblePrimary = primaryNav.filter((item) => item.allowed.includes(user.role));
  const visibleSecondary = secondaryNav.filter((item) => item.allowed.includes(user.role));

  const NavLink = ({
    item,
    onNavigate,
  }: {
    item: (typeof primaryNav)[number];
    onNavigate?: () => void;
  }) => {
    const isActive = location === item.href || location.startsWith(`${item.href}/`);
    return (
      <Link key={item.href} href={item.href} onClick={onNavigate}>
        <div
          className={cn(
            "flex items-center px-3 min-h-[52px] text-sm font-medium rounded-lg transition-colors cursor-pointer",
            isActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <span className="mr-3 shrink-0">{item.icon}</span>
          {item.title}
        </div>
      </Link>
    );
  };

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="space-y-1 px-3">
      {visiblePrimary.map((item) => (
        <NavLink key={item.href} item={item} onNavigate={onNavigate} />
      ))}
      {visibleSecondary.length > 0 && (
        <>
          <div className="my-2 border-t border-border/50" />
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Outils
          </div>
          {visibleSecondary.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </>
      )}
    </nav>
  );

  const NavFooter = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="p-4 border-t border-border mt-auto">
      <div className="flex items-center gap-3 px-2 mb-3">
        <Avatar className="h-9 w-9 shrink-0 bg-primary/10 text-primary">
          <AvatarFallback>
            {user.firstName[0]}
            {user.lastName[0]}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col overflow-hidden min-w-0">
          <span className="text-sm font-medium truncate">
            {user.firstName} {user.lastName}
          </span>
          <span className="text-xs text-muted-foreground capitalize truncate">{user.role}</span>
        </div>
      </div>
      <Button
        variant="outline"
        className="w-full justify-start h-11"
        onClick={() => {
          logout();
          onNavigate?.();
        }}
      >
        <LogOut className="h-4 w-4 mr-2" />
        Déconnexion
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex w-full">
      {/* Desktop / Large-tablet Sidebar (≥1024px) */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex h-16 items-center px-6 text-primary border-b border-border">
          <Activity className="h-6 w-6 mr-2 shrink-0" />
          <span className="font-bold text-lg tracking-tight">DPI TRS Tracker</span>
        </div>
        <div className="flex-1 py-4 overflow-y-auto">
          <NavLinks />
        </div>
        <NavFooter />
      </aside>

      {/* Mobile / Tablet Drawer overlay */}
      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile / Tablet Drawer panel */}
      <aside
        className={cn(
          "lg:hidden fixed left-0 top-0 bottom-0 z-50 w-72 flex flex-col bg-card border-r border-border transition-transform duration-200",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5 border-b border-border">
          <div className="flex items-center text-primary">
            <Activity className="h-5 w-5 mr-2" />
            <span className="font-bold text-base tracking-tight">DPI TRS Tracker</span>
          </div>
          <button
            className="h-10 w-10 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            onClick={() => setDrawerOpen(false)}
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 py-3 overflow-y-auto">
          <NavLinks onNavigate={() => setDrawerOpen(false)} />
        </div>
        <NavFooter onNavigate={() => setDrawerOpen(false)} />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile / Tablet top bar */}
        <header className="lg:hidden flex h-14 items-center border-b border-border bg-card px-4 sticky top-0 z-30">
          <button
            className="h-11 w-11 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors mr-2 -ml-1"
            onClick={() => setDrawerOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Activity className="h-5 w-5 text-primary mr-2" />
          <span className="font-bold text-base tracking-tight text-primary">DPI TRS</span>
        </header>

        <div className="flex-1 overflow-auto bg-slate-50/50 dark:bg-background/95">{children}</div>
      </main>
    </div>
  );
}
