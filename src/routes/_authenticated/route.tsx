import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getSession reads the locally cached session (no network round-trip);
    // server functions still validate the JWT server-side on every call.
    const { data, error } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (error || !user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: () => <Outlet />,
});
