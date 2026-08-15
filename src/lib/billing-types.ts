export type SubscriptionStatus =
  | "unpaid"
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid_incomplete";

export const ENTITLED_STATUSES: SubscriptionStatus[] = ["active", "trialing"];

export type SubscriptionDTO = {
  status: SubscriptionStatus;
  entitled: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  hasCustomer: boolean;
};

export function isEntitled(status: string | null | undefined) {
  return ENTITLED_STATUSES.includes((status ?? "unpaid") as SubscriptionStatus);
}

export const STATUS_LABEL: Record<string, string> = {
  unpaid: "No subscription",
  active: "Active",
  trialing: "Trialing",
  past_due: "Payment past due",
  canceled: "Canceled",
  unpaid_incomplete: "Payment incomplete",
};
