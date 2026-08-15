import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const navLink =
  "rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground";
const activeProps = { className: "bg-card text-foreground" } as const;
const solid =
  "rounded-xl bg-foreground px-3 py-2 text-center text-sm font-medium text-background transition-opacity hover:opacity-90";
const outline =
  "rounded-xl border border-border bg-card px-3 py-2 text-center text-sm font-medium text-foreground transition-colors hover:border-ring";

export function SiteSidebar() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
          <Link to="/" hash="directory" className={navLink}>
            Browse
          </Link>
          <Link to="/trends" className={navLink} activeProps={activeProps}>
            Trending
          </Link>
          {loading || !user ? null : (
            <>
              <Link to="/dashboard" className={navLink} activeProps={activeProps}>
                Dashboard
              </Link>
              <Link to="/remix" className={navLink} activeProps={activeProps}>
                Remix studio
              </Link>
              <Link to="/knowledge" className={navLink} activeProps={activeProps}>
                Knowledge base
              </Link>
              <Link to="/billing" className={navLink} activeProps={activeProps}>
                Billing
              </Link>
            </>
          )}
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
