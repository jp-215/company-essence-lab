import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const navLink =
  "relative rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground";
const navLinkActive =
  "bg-card text-foreground font-semibold before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-foreground";
const solid =
  "rounded-xl bg-foreground px-3 py-2 text-center text-sm font-medium text-background transition-opacity hover:opacity-90";
const outline =
  "rounded-xl border border-border bg-card px-3 py-2 text-center text-sm font-medium text-foreground transition-colors hover:border-ring";


const mainNav = [
  { to: "/trends", label: "Trending", auth: false },
  { to: "/dashboard", label: "Dashboard", auth: true },
  { to: "/community", label: "Community", auth: true },
  { to: "/remix", label: "Remix studio", auth: true },
  { to: "/creatives", label: "Image creatives", auth: true },
  { to: "/reviews", label: "Reviews", auth: true },
  { to: "/knowledge", label: "Knowledge base", auth: true },
  { to: "/billing", label: "Billing", auth: true },
] as const;

export function SiteSidebar() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <aside className="border-b border-border bg-background/90 backdrop-blur md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
      <div className="flex h-full flex-col gap-6 px-4 py-5">
        <Link to="/" className="flex flex-col gap-1 px-2">
          <span className="font-serif text-2xl font-bold tracking-tight text-foreground">Vira</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            Viral ad remix
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1 overflow-x-auto md:overflow-visible">
          <Link
            to="/"
            hash="directory"
            className={cn(navLink, pathname === "/" && navLinkActive)}
            aria-current={pathname === "/" ? "page" : undefined}
          >
            Browse
          </Link>
          {mainNav
            .filter((item) => !item.auth || (!loading && !!user))
            .map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(navLink, isActive(item.to) && navLinkActive)}
                aria-current={isActive(item.to) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
        </nav>


        <div className={cn("flex flex-col gap-2")}>
          {loading ? null : user ? (
            <>
              <button type="button" onClick={handleSignOut} className={outline}>
                Sign out
              </button>
              <Link to="/studio/new" className={solid}>
                List a company
              </Link>
            </>
          ) : (
            <>
              <Link to="/auth" className={outline}>
                Sign in
              </Link>
              <Link to="/auth" search={{ tab: "signup" }} className={solid}>
                List your company
              </Link>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
