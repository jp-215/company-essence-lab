import { useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";

import { createCompany } from "@/lib/owner.functions";
import { runEnrichment } from "@/lib/enrich.functions";
import { listCategories } from "@/lib/companies.functions";
import { supabase } from "@/integrations/supabase/client";
import { LOGO_BUCKET } from "@/lib/company-types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/studio/new")({
  head: () => ({
    meta: [
      { title: "What are you selling? — Vira" },
      {
        name: "description",
        content:
          "Three quick steps: photos, brand name and category, then your story. Vira builds the rest of your purpose identity.",
      },
      { property: "og:title", content: "What are you selling? — Vira" },
      {
        property: "og:description",
        content: "Start your brand on Vira in about two minutes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewCompany,
});

type Photo = { path: string; url: string | null };

function shortLabel(name: string) {
  const map: Record<string, string> = {
    "Beauty & Personal Care": "Beauty",
    "Food & Beverage": "Food & Bev",
    "Home & Living": "Home",
    "Apparel & Accessories": "Apparel",
    "Consumer Electronics & Gadgets": "Gadgets",
  };
  return map[name] ?? name;
}

function NewCompany() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useServerFn(createCompany);
  const enrich = useServerFn(runEnrichment);
  const fetchCategories = useServerFn(listCategories);
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => fetchCategories(),
  });

  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [bio, setBio] = useState("");
  const [mission, setMission] = useState("");

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const room = 5 - photos.length;
    if (room <= 0) {
      toast.error("Five photos is the max.");
      return;
    }

    setUploading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setUploading(false);
      toast.error("Your session expired. Please sign in again.");
      return;
    }

    const next: Photo[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      if (file.size > 5_000_000) {
        toast.error(`${file.name} is larger than 5 MB.`);
        continue;
      }
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) {
        toast.error(error.message);
        continue;
      }
      const { data: signed } = await supabase.storage
        .from(LOGO_BUCKET)
        .createSignedUrl(path, 60 * 60);
      next.push({ path, url: signed?.signedUrl ?? null });
    }

    setUploading(false);
    if (next.length) setPhotos((current) => [...current, ...next]);
  }

  function nextStep() {
    if (step === 1) {
      if (!photos.length) {
        toast.error("Add at least one photo — it's the one thing we truly need.");
        return;
      }
      if (!name.trim()) {
        toast.error("Tell us your brand name.");
        return;
      }
      if (!categoryId) {
        toast.error("Pick the category you serve.");
        return;
      }
    }
    setStep((current) => Math.min(2, current + 1));
  }

  async function publish() {
    if (!ownerName.trim()) {
      toast.error("Who owns the brand?");
      return;
    }
    if (bio.trim().length < 10) {
      toast.error("A couple more words about who you are.");
      return;
    }
    if (mission.trim().length < 10) {
      toast.error("Your mission needs a little more detail.");
      return;
    }

    setBusy(true);
    try {
      const result = await create({
        data: {
          name: name.trim(),
          ownerName: ownerName.trim(),
          categoryId,
          bio: bio.trim(),
          mission: mission.trim(),
          website: website.trim() || null,
          logoPath: photos[0]?.path ?? null,
        },
      });

      toast.success("Brand is live.");
      void enrich({ data: { companyId: result.id } })
        .then(() => queryClient.invalidateQueries({ queryKey: ["my-companies"] }))
        .catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: ["my-companies"] });
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const heading = step === 1 ? "What are you selling?" : "Who's behind it?";
  const subheading =
    step === 1
      ? "Photos do the talking — a phone photo is perfect. It's the only thing we truly need."
      : "A short intro and your mission, in your own words. This shapes every remix we generate.";

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-secondary/40">
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Step {step} of 2 · about 2 minutes total
        </p>
        <h1 className="mt-4 font-serif text-5xl font-bold tracking-tight text-foreground">
          {heading}
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">{subheading}</p>

        {step === 1 ? (
          <div className="mt-10 space-y-8">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void handleFiles(event.dataTransfer.files);
              }}
              className="flex w-full items-center gap-5 rounded-2xl border-2 border-dashed border-border bg-card p-6 text-left transition-colors hover:border-ring"
            >
              <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-accent">
                <Plus className="size-5 text-chart-1" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold text-foreground">
                  {uploading ? "Uploading…" : "Drag photos here, or browse"}
                </span>
                <span className="block text-sm text-muted-foreground">
                  1–5 photos · JPG, PNG or HEIC · straight off your phone is fine
                </span>
              </span>
              <span className="flex shrink-0 gap-2">
                {photos.map((photo, index) => (
                  <span key={photo.path} className="relative block">
                    <img
                      src={photo.url ?? ""}
                      alt={`Product photo ${index + 1}`}
                      loading="lazy"
                      className="size-16 rounded-lg border border-border bg-muted object-cover"
                    />
                    {index === 0 ? (
                      <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground">
                        <Check className="size-3 text-background" />
                      </span>
                    ) : null}
                  </span>
                ))}
              </span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                void handleFiles(event.target.files);
                event.target.value = "";
              }}
            />

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-base">
                  Brand name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Glowry"
                  maxLength={80}
                  className="h-14 rounded-xl bg-card text-lg"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website" className="text-base">
                  Website{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional — we'll fill in the rest)
                  </span>
                </Label>
                <Input
                  id="website"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  placeholder="glowry.co"
                  maxLength={200}
                  className="h-14 rounded-xl bg-card text-lg"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-base">Category</Label>
              <div className="flex flex-wrap gap-3">
                {(categories ?? []).map((category) => {
                  const selected = category.id === categoryId;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setCategoryId(category.id)}
                      aria-pressed={selected}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-6 py-3 text-base font-medium transition-colors",
                        selected
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-card text-foreground hover:border-ring",
                      )}
                    >
                      {shortLabel(category.name)}
                      {selected ? <Check className="size-4" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-10 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="ownerName" className="text-base">
                Owner
              </Label>
              <Input
                id="ownerName"
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
                placeholder="Jane Okafor"
                maxLength={80}
                className="h-14 rounded-xl bg-card text-lg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio" className="text-base">
                Who you are
              </Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                rows={6}
                maxLength={1200}
                placeholder="We make small-batch skincare for people who hate 12-step routines."
                className="rounded-xl bg-card text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mission" className="text-base">
                Mission
              </Label>
              <Textarea
                id="mission"
                value={mission}
                onChange={(event) => setMission(event.target.value)}
                rows={6}
                maxLength={1200}
                placeholder="Make honest skincare the default for everyone under 30."
                className="rounded-xl bg-card text-base"
              />
            </div>
          </div>
        ) : null}

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {step === 1 ? (
              "No credit card · your first concept is free"
            ) : (
              <button
                type="button"
                onClick={() => setStep((current) => current - 1)}
                className="underline underline-offset-4 hover:text-foreground"
              >
                ← Back
              </button>
            )}
          </p>
          <button
            type="button"
            disabled={busy || uploading}
            onClick={() => (step === 2 ? void publish() : nextStep())}
            className="inline-flex items-center gap-2 rounded-xl bg-chart-1 px-8 py-4 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {step === 2 ? (busy ? "Publishing…" : "Publish brand") : "Continue"}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
