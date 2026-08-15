import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { listCategories } from "@/lib/companies.functions";
import { supabase } from "@/integrations/supabase/client";
import { LOGO_BUCKET, type OwnerCompanyDTO } from "@/lib/company-types";
import { downscaleImage } from "@/lib/image-utils";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CompanyFormValues = {
  name: string;
  ownerName: string;
  categoryId: string;
  bio: string;
  mission: string;
  website: string;
  logoPath: string | null;
};

type Props = {
  initial?: OwnerCompanyDTO | undefined;
  submitLabel: string;
  onSubmit: (values: CompanyFormValues) => Promise<void>;
};

export function CompanyForm({ initial, submitLabel, onSubmit }: Props) {
  const fetchCategories = useServerFn(listCategories);
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => fetchCategories(),
  });

  const [values, setValues] = useState<CompanyFormValues>({
    name: initial?.name ?? "",
    ownerName: initial?.ownerName ?? "",
    categoryId: initial?.categoryId ?? "",
    bio: initial?.bio ?? "",
    mission: initial?.mission ?? "",
    website: initial?.website ?? "",
    logoPath: initial?.logoPath ?? null,
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(initial?.logoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof CompanyFormValues>(key: K, value: CompanyFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    if (!picked) return;
    if (picked.size > 2_000_000) {
      toast.error("Logo must be smaller than 2 MB.");
      return;
    }
    const file = await downscaleImage(picked);

    setUploading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setUploading(false);
      toast.error("Your session expired. Please sign in again.");
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    setUploading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    const { data: signed } = await supabase.storage
      .from(LOGO_BUCKET)
      .createSignedUrl(path, 60 * 60);
    set("logoPath", path);
    setLogoPreview(signed?.signedUrl ?? null);
    toast.success("Logo uploaded.");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (initial) {
      const unchanged =
        values.name === initial.name &&
        values.ownerName === initial.ownerName &&
        values.categoryId === initial.categoryId &&
        values.bio === initial.bio &&
        values.mission === initial.mission &&
        values.website === (initial.website ?? "") &&
        values.logoPath === (initial.logoPath ?? null);
      if (unchanged) {
        toast.info("Nothing changed — no save needed.");
        return;
      }
    }
    if (!values.categoryId) {
      toast.error("Pick the category you serve.");
      return;
    }
    if (values.bio.trim().length < 10 || values.mission.trim().length < 10) {
      toast.error("Bio and mission need a little more detail.");
      return;
    }

    setBusy(true);
    try {
      await onSubmit(values);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <section className="space-y-4">
        <h2 className="font-serif text-lg font-semibold text-foreground">Company identity</h2>

        <div className="flex items-center gap-4">
          <BrandLogo name={values.name || "New brand"} logoUrl={logoPreview} className="size-20" />
          <div className="space-y-2">
            <Label htmlFor="logo">Logo</Label>
            <Input
              id="logo"
              type="file"
              accept="image/*"
              onChange={handleLogo}
              disabled={uploading}
            />
            <p className="text-xs text-muted-foreground">PNG, JPG or SVG up to 2 MB.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Company name</Label>
            <Input
              id="name"
              value={values.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Northbrook Goods"
              required
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground">
              Must be unique — one listing per company.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ownerName">Owner</Label>
            <Input
              id="ownerName"
              value={values.ownerName}
              onChange={(event) => set("ownerName", event.target.value)}
              placeholder="Jane Okafor"
              required
              maxLength={80}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="category">Category served</Label>
            <Select value={values.categoryId} onValueChange={(value) => set("categoryId", value)}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {(categories ?? []).map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              value={values.website}
              onChange={(event) => set("website", event.target.value)}
              placeholder="northbrookgoods.com"
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">
              Used to scrape public brand and advertising signals.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-serif text-lg font-semibold text-foreground">Story</h2>
        <div className="space-y-2">
          <Label htmlFor="bio">Who you are (bio)</Label>
          <Textarea
            id="bio"
            value={values.bio}
            onChange={(event) => set("bio", event.target.value)}
            rows={5}
            maxLength={1200}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mission">Mission</Label>
          <Textarea
            id="mission"
            value={values.mission}
            onChange={(event) => set("mission", event.target.value)}
            rows={4}
            maxLength={1200}
            required
          />
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background px-4 py-3">
        <Button type="submit" disabled={busy || uploading}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
