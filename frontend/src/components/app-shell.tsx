'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { createBrowserSupabaseClient, getCurrentUser } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LayoutDashboard,
  Camera,
  ImageIcon,
  Video,
  Radio,
  Route,
  Map,
  FileText,
  Settings,
  Shield,
  LogOut,
  Sun,
  Moon,
  Menu,
  Loader2,
} from 'lucide-react';

export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/detect/image', label: 'Image', icon: ImageIcon },
  { href: '/detect/video', label: 'Video', icon: Video },
  { href: '/detect/live', label: 'Live', icon: Radio },
  { href: '/detections', label: 'Detections', icon: Camera },
  { href: '/sessions', label: 'Sessions', icon: Route },
  { href: '/map', label: 'Map', icon: Map },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface AuthUser {
  id: string;
  email?: string;
}

export function AppShell({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [role, setRole] = React.useState<string>('USER');
  const [checked, setChecked] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace('/auth/login');
          return;
        }
        if (!active) return;
        setUser({ id: user.id, email: user.email });
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        if (active && profile?.role) setRole(profile.role);
      } catch {
        router.replace('/auth/login');
      } finally {
        if (active) setChecked(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  const handleSignOut = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Checking your session…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-xl font-semibold">Sign in required</h1>
          <p className="text-sm text-muted-foreground">
            You need an account to access this page. Redirecting to login…
          </p>
          <Button asChild>
            <Link href="/auth/login">Go to login</Link>
          </Button>
        </div>
      </div>
    );
  }

  const items = admin
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => item.href !== '/admin');

  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-40 px-4 pt-4">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-card)]">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5 font-semibold tracking-tight transition-opacity hover:opacity-80">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground text-xs font-bold">
              SP
            </span>
            <span className="hidden sm:inline">SmartPothole</span>
          </Link>

          <nav className="hidden items-center gap-0.5 overflow-x-auto lg:flex" aria-label="Main navigation">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors duration-200 active:scale-[0.97] ${
                    active
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
            >
              {!mounted ? (
                <span className="h-4 w-4" />
              ) : resolvedTheme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>

            {role === 'ADMIN' && (
              <Badge variant="outline" className="hidden sm:inline-flex">
                <Shield className="h-3 w-3" /> Admin
              </Badge>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="hidden rounded-full sm:inline-flex" aria-label="Account menu">
                  {(user.email || 'Account').slice(0, 24)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="icon"
              className="rounded-full lg:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileOpen}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="mx-auto mt-2 grid max-w-7xl grid-cols-3 gap-1 rounded-2xl border border-border bg-card p-2 shadow-[var(--shadow-card)] lg:hidden" aria-label="Mobile navigation">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors duration-200 active:scale-[0.97] ${
                    active ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-10 pt-28">{children}</main>

      <footer className="px-4 pb-6 text-center text-xs text-muted-foreground">
        Severity is an AI-assisted visual estimate and should not be treated as a certified engineering measurement.
      </footer>
    </div>
  );
}
