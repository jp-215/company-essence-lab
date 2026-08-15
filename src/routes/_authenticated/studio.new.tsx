import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { createCompany } from "@/lib/owner.functions";
import { runEnrichment } from "@/lib/enrich.functions";
import { CompanyForm } from "@/components/CompanyForm";

export const Route = createFileRoute("/_authenticated/studio/new")({
  head: () => ({
    meta: [
      { title: "List your company — GTM Hackathons" },
      {
        name: "description",
        content:
          "Complete company sign-up: logo, name, owner, category, bio and mission for your consumer-product brand.",
      },
      { property: "og:title", content: "List your company — GTM Hackathons" },
      { property: "og:description", content: "Publish your brand to the marketplace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewCompany,
});

function NewCompany() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useServerFn(createCompany);
  const enrich = useServerFn(runEnrichment);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">
        Company sign-up
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Everything here powers your public profile and the purpose identity we build from public
        advertising signals.
      </p>

      <div className="mt-8">
        <CompanyForm
          submitLabel="Publish company"
          onSubmit={async (values) => {
            const result = await create({
              data: {
                name: values.name,
                ownerName: values.ownerName,
                categoryId: values.categoryId,
                bio: values.bio,
                mission: values.mission,
                website: values.website || null,
                logoPath: values.logoPath,
              },
            });

            toast.success("Company published.");
            void enrich({ data: { companyId: result.id } })
              .then(() => queryClient.invalidateQueries({ queryKey: ["my-companies"] }))
              .catch(() => undefined);

            void queryClient.invalidateQueries({ queryKey: ["my-companies"] });
            navigate({ to: "/dashboard" });
          }}
        />
      </div>
    </div>
  );
}
