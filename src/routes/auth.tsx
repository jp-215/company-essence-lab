import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Eyebrow, PageShell, PageTitle, Panel } from "@/components/Page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  validateSearch: (search) =>
    z
      .object({
        tab: z.enum(["signin", "signup"]).optional(),
        next: z.string().optional(),
        reason: z.enum(["protected"]).optional(),
      })
      .parse(search),

  head: () => ({
    meta: [
      { title: "Sign in — Vira" },
      {
        name: "description",
        content:
          "Sign in or create an account to list your consumer-product company on the Vira marketplace.",
      },
      { property: "og:title", content: "Sign in — Vira" },
      {
        property: "og:description",
        content: "Access your brand dashboard and publish your company profile.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
});

const field = "h-11 rounded-xl bg-card text-base";
const primary =
  "w-full rounded-xl bg-foreground px-7 py-3 text-base font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60";

const routeLabels: Record<string, string> = {
  "/billing": "Billing",
  "/remix": "Remix studio",
  "/dashboard": "Dashboard",
  "/knowledge": "Knowledge base",
  "/community": "Community",
};

function AuthPage() {
  const navigate = useNavigate();
  const { tab, next, reason } = Route.useSearch();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">(tab ?? "signin");

  // Only same-origin app paths are honoured as a post-sign-in destination.
  const destination = next && /^\/[A-Za-z0-9\-_/]*$/.test(next) ? next : "/dashboard";
  const gatedLabel = reason === "protected" ? (routeLabels[destination] ?? "That page") : null;

  useEffect(() => {
    if (!loading && user) navigate({ to: destination, replace: true });
  }, [loading, user, navigate, destination]);

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = credentials.safeParse({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your details.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: destination });
  }


  async function handleSignUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("displayName") ?? "").trim();
    const parsed = credentials.safeParse({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your details.");
      return;
    }
    if (displayName.length < 2) {
      toast.error("Tell us your name.");
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      ...parsed.data,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: displayName },
      },
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      setCheckEmail(true);
      toast.success("Confirm your email to finish signing up.");
      return;
    }
    navigate({ to: "/studio/new" });
  }

  return (
    <PageShell width="narrow">
      <Eyebrow>Onboarding</Eyebrow>
      <PageTitle className="mt-4">
        {checkEmail
          ? "Check your inbox"
          : mode === "signin"
            ? "Welcome back"
            : "Create your account"}
      </PageTitle>
      <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
        {checkEmail
          ? "We sent a confirmation link. Open it to activate your account, then sign in and finish your company profile."
          : "Existing brands sign in. New brands complete the full company profile right after signing up."}
      </p>

      {checkEmail ? (
        <Panel className="mt-10 max-w-lg p-8">
          <button
            type="button"
            onClick={() => setCheckEmail(false)}
            className="w-full rounded-xl border border-border bg-card px-7 py-4 text-base font-medium text-foreground transition-colors hover:border-ring"
          >
            Back to sign in
          </button>
        </Panel>
      ) : (
        <div className="mt-6 max-w-lg">
          <div className="flex flex-wrap gap-3">
            {(["signin", "signup"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={cn(
                  "rounded-full px-5 py-2 text-sm font-medium transition-colors",
                  mode === value
                    ? "bg-foreground text-background"
                    : "border border-border bg-card text-foreground hover:border-ring",
                )}
              >
                {value === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <Panel className="mt-4 p-6">
            {mode === "signin" ? (
              <form className="space-y-4" onSubmit={handleSignIn}>
                <div className="space-y-2">
                  <Label htmlFor="signin-email" className="text-base">
                    Work email
                  </Label>
                  <Input
                    id="signin-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className={field}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password" className="text-base">
                    Password
                  </Label>
                  <Input
                    id="signin-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className={field}
                  />
                </div>
                <button type="submit" className={primary} disabled={busy}>
                  {busy ? "Signing in…" : "Sign in"}
                </button>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={handleSignUp}>
                <div className="space-y-2">
                  <Label htmlFor="signup-name" className="text-base">
                    Your name
                  </Label>
                  <Input
                    id="signup-name"
                    name="displayName"
                    autoComplete="name"
                    required
                    className={field}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-base">
                    Work email
                  </Label>
                  <Input
                    id="signup-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className={field}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-base">
                    Password
                  </Label>
                  <Input
                    id="signup-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    className={field}
                  />
                  <p className="text-sm text-muted-foreground">At least 8 characters.</p>
                </div>
                <button type="submit" className={primary} disabled={busy}>
                  {busy ? "Creating account…" : "Create account"}
                </button>
              </form>
            )}
          </Panel>
        </div>
      )}

      <p className="mt-6 text-base text-muted-foreground">
        <Link to="/" className="underline underline-offset-4 hover:text-foreground">
          Back to the marketplace
        </Link>
      </p>
    </PageShell>
  );
}
