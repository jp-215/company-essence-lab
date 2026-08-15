import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const navLink =
  "rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";
const solid =
  "rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90";
const outline =
  "rounded-full border border-border bg-card px-5 py-2 text-sm font-medium text-foreground transition-colors hover:border-ring";

export function SiteHeader() {
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
    <header className="border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <Link to="/" className="flex items-baseline gap-3">
          <span className="font-serif text-2xl font-bold tracking-tight text-foreground">Vira</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground sm:inline">
            Viral ad remix
          </span>
        </Link>

        <nav className="flex items-center gap-2">
          <Link to="/" className={cn(navLink, "hidden sm:inline-flex")}>
            Browse
          </Link>
          <Link to="/trends" className={cn(navLink, "hidden sm:inline-flex")}>
            Trending
          </Link>
          {loading ? null : user ? (
            <>
              <Link to="/dashboard" className={cn(navLink, "hidden sm:inline-flex")}>
                Dashboard
              </Link>
              <Link to="/remix" className={cn(navLink, "hidden sm:inline-flex")}>
                Remix studio
              </Link>
              <Link to="/knowledge" className={cn(navLink, "hidden md:inline-flex")}>
                Knowledge base
              </Link>
              <Link to="/studio/new" className={solid}>
                List a company
              </Link>
              <button type="button" onClick={handleSignOut} className={outline}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/auth" className={navLink}>
                Sign in
              </Link>
              <Link to="/auth" className={solid}>
                List your company
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
