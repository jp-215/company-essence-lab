import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, CreditCard, Loader2 } from "lucide-react";

import {
  createCheckoutSession,
  createPortalSession,
  getMySubscription,
  syncMySubscription,
} from "@/lib/billing.functions";
import { STATUS_LABEL } from "@/lib/billing-types";
import { Eyebrow, Lead, PageShell, PageTitle, Panel } from "@/components/Page";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Subscription & billing — Vira" },
      {
        name: "description",
        content:
          "Manage your Vira subscription: start a plan, update payment details, or view invoices.",
      },
      { property: "og:title", content: "Subscription & billing — Vira" },
      {
        property: "og:description",
        content: "Start or manage your Vira plan to unlock brand onboarding and ad remixing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Billing,
});

const PERKS = [
  "Unlimited brand onboarding and purpose identity builds",
  "Access to 3,000 scraped viral trends with semantic matching",
  "Unlimited ad remixes and concept generation",
  "Terac expert review rounds on every concept",
];

function Billing() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchSubscription = useServerFn(getMySubscription);
  const startCheckout = useServerFn(createCheckoutSession);
  const openPortal = useServerFn(createPortalSession);
  const sync = useServerFn(syncMySubscription);
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);

  const { data: subscription, isLoading } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => fetchSubscription(),
    refetchInterval: (query) => (query.state.data?.entitled ? false : 5000),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;
    void sync()
      .then(() => queryClient.invalidateQueries({ queryKey: ["subscription"] }))
      .catch(() => undefined);
  }, [queryClient, sync]);

  async function goToCheckout() {
    setBusy("checkout");
    try {
      const { url } = await startCheckout({ data: { origin: window.location.origin } });
      window.location.href = url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start checkout");
      setBusy(null);
    }
  }

  async function goToPortal() {
    setBusy("portal");
    try {
      const { url } = await openPortal({ data: { origin: window.location.origin } });
      window.location.href = url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open billing portal");
      setBusy(null);
    }
  }

  const status = subscription?.status ?? "unpaid";
  const entitled = subscription?.entitled ?? false;

  return (
    <PageShell>
      <Eyebrow>Billing</Eyebrow>
      <PageTitle>{entitled ? "Your Vira plan" : "Unlock Vira"}</PageTitle>
      <Lead>
        {entitled
          ? "Your subscription is live. Manage payment details, invoices, or cancellation any time."
          : "Vira is a subscription product. Start your plan to onboard your first brand and generate remixes."}
      </Lead>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Vira Subscription
          </p>
          <p className="mt-4 font-serif text-5xl font-bold tracking-tight text-foreground">
            $49<span className="text-lg font-normal text-muted-foreground"> / month</span>
          </p>
          <ul className="mt-8 space-y-3">
            {PERKS.map((perk) => (
              <li key={perk} className="flex gap-3 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                <span>{perk}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            {entitled ? (
              <Button onClick={() => void navigate({ to: "/studio/new" })}>
                Onboard a brand →
              </Button>
            ) : (
              <Button onClick={() => void goToCheckout()} disabled={busy !== null || isLoading}>
                {busy === "checkout" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                {status === "past_due" || status === "unpaid_incomplete"
                  ? "Fix payment & resubscribe"
                  : "Start subscription"}
              </Button>
            )}
            <Button variant="outline" onClick={() => void goToPortal()} disabled={busy !== null}>
              {busy === "portal" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Customer portal
            </Button>
          </div>
        </Panel>

        <Panel className="p-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Status
          </p>
          <p className="mt-4 font-serif text-3xl font-bold text-foreground">
            {isLoading ? "Checking…" : (STATUS_LABEL[status] ?? status)}
          </p>
          {subscription?.currentPeriodEnd ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {subscription.cancelAtPeriodEnd ? "Access ends " : "Renews "}
              {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
            </p>
          ) : null}
          {!entitled ? (
            <p className="mt-6 text-sm text-muted-foreground">
              Brand onboarding stays locked until the subscription is active. Test mode card:
              4242 4242 4242 4242 with any future expiry.
            </p>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">
              Everything is unlocked. Jump into{" "}
              <Link to="/remix" className="underline">
                Remix Studio
              </Link>
              .
            </p>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
