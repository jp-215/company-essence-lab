import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        if (!secret) return new Response("Webhook secret not configured", { status: 500 });

        const payload = await request.text();
        const {
          verifyStripeSignature,
          syncSubscriptionObject,
          markStatusByCustomer,
          stripeRequest,
          upsertSubscription,
        } = await import("@/lib/billing.server");

        if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event: any;
        try {
          event = JSON.parse(payload);
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object;
              const userId: string | null =
                session?.metadata?.user_id ?? session?.client_reference_id ?? null;
              if (session?.subscription) {
                const subscription = await stripeRequest(
                  `/subscriptions/${session.subscription}`,
                  { method: "GET" },
                );
                if (userId) {
                  subscription.metadata = {
                    ...(subscription.metadata ?? {}),
                    user_id: userId,
                  };
                }
                await syncSubscriptionObject(subscription);
              } else if (userId) {
                await upsertSubscription({
                  userId,
                  status: "active",
                  customerId: session?.customer ?? null,
                });
              }
              break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated": {
              await syncSubscriptionObject(event.data.object);
              break;
            }
            case "customer.subscription.deleted": {
              await syncSubscriptionObject(event.data.object, true);
              break;
            }
            case "invoice.payment_failed": {
              await markStatusByCustomer(event.data.object?.customer ?? null, "past_due");
              break;
            }
            case "invoice.payment_succeeded":
            case "invoice.paid": {
              const invoice = event.data.object;
              const subscriptionId =
                invoice?.subscription ?? invoice?.parent?.subscription_details?.subscription;
              if (subscriptionId) {
                const subscription = await stripeRequest(`/subscriptions/${subscriptionId}`, {
                  method: "GET",
                });
                await syncSubscriptionObject(subscription);
              }
              break;
            }
            default:
              break;
          }
        } catch (error) {
          console.error("stripe webhook handling failed", event?.type, error);
          return new Response("Handler error", { status: 500 });
        }

        return Response.json({ received: true });
      },
    },
  },
});
