import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { getMyCompany, updateCompany } from "@/lib/owner.functions";
import { CompanyForm } from "@/components/CompanyForm";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/studio/$id")({
  head: () => ({
    meta: [
      { title: "Edit company — Vira" },
      { name: "description", content: "Update your company profile and brand story." },
      { property: "og:title", content: "Edit company — Vira" },
      { property: "og:description", content: "Update your company profile and brand story." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditCompany,
});

function EditCompany() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchCompany = useServerFn(getMyCompany);
  const save = useServerFn(updateCompany);

  const { data, isLoading } = useQuery({
    queryKey: ["my-company", id],
    queryFn: () => fetchCompany({ data: { id } }),
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">
        Edit company
      </h1>

      <div className="mt-8">
        {isLoading ? (
          <Skeleton className="h-96 w-full" />
        ) : !data ? (
          <p className="text-sm text-muted-foreground">We couldn't find that company.</p>
        ) : (
          <CompanyForm
            initial={data}
            submitLabel="Save changes"
            onSubmit={async (values) => {
              await save({
                data: {
                  id,
                  name: values.name,
                  ownerName: values.ownerName,
                  categoryId: values.categoryId,
                  bio: values.bio,
                  mission: values.mission,
                  website: values.website || null,
                  logoPath: values.logoPath,
                },
              });
              toast.success("Company updated.");
              void queryClient.invalidateQueries({ queryKey: ["my-companies"] });
              navigate({ to: "/dashboard" });
            }}
          />
        )}
      </div>
    </div>
  );
}
