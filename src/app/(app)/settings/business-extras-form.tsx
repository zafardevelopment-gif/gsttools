"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, PenLine } from "lucide-react";
import {
  updateBusinessExtrasAction,
  uploadBrandingAction,
} from "@/server/actions/settings-extra";
import { publicEnv } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BUSINESS_TYPES = ["Retailer", "Wholesaler", "Distributor", "Manufacturer", "Services"];
const REGISTRATION_TYPES = [
  "Sole Proprietorship",
  "Partnership",
  "Private Limited Company",
  "LLP",
  "HUF",
  "Not Registered",
];
const INDUSTRY_TYPES = [
  "Kirana / Grocery",
  "Electronics",
  "Hardware",
  "Garments / Textile",
  "Medical / Pharma",
  "Restaurant / Food",
  "Agriculture",
  "Other",
];

function storageUrl(path: string | null): string | null {
  if (!path) return null;
  return `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${path}`;
}

function BrandingUpload({
  kind,
  label,
  currentPath,
  icon: Icon,
}: {
  kind: "logo" | "signature";
  label: string;
  currentPath: string | null;
  icon: typeof ImagePlus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const url = storageUrl(currentPath);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("file", file);
    startTransition(async () => {
      const res = await uploadBrandingAction(fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success(`${label} upload ho gaya.`);
        router.refresh();
      }
    });
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={pending}
      className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-primary/30 bg-primary/[0.03] text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} className="max-h-16 max-w-[80%] object-contain" />
      ) : (
        <Icon className="size-6 text-primary/60" />
      )}
      <span className="text-xs font-medium">
        {pending ? "Uploading…" : url ? `Change ${label}` : `Upload ${label}`}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onPick}
      />
    </button>
  );
}

export function BusinessExtrasForm({
  tenant,
}: {
  tenant: {
    pan: string | null;
    upi_id: string | null;
    business_type: string | null;
    industry_type: string | null;
    registration_type: string | null;
    gst_registered: boolean;
    tds_enabled: boolean;
    tcs_enabled: boolean;
    default_terms: string | null;
    logo_path: string | null;
    signature_path: string | null;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [businessType, setBusinessType] = useState(tenant.business_type ?? "");
  const [industryType, setIndustryType] = useState(tenant.industry_type ?? "");
  const [registrationType, setRegistrationType] = useState(tenant.registration_type ?? "");
  const [gstRegistered, setGstRegistered] = useState(tenant.gst_registered);
  const [tds, setTds] = useState(tenant.tds_enabled);
  const [tcs, setTcs] = useState(tenant.tcs_enabled);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateBusinessExtrasAction({
        pan: String(fd.get("pan") ?? ""),
        upiId: String(fd.get("upi_id") ?? ""),
        businessType,
        industryType,
        registrationType,
        gstRegistered,
        tdsEnabled: tds,
        tcsEnabled: tcs,
        defaultTerms: String(fd.get("default_terms") ?? ""),
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Business details saved.");
        router.refresh();
      }
    });
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Branding & business details</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Business logo (invoices par dikhega)</Label>
            <BrandingUpload
              kind="logo"
              label="logo"
              currentPath={tenant.logo_path}
              icon={ImagePlus}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Signature (invoices par dikhega)</Label>
            <BrandingUpload
              kind="signature"
              label="signature"
              currentPath={tenant.signature_path}
              icon={PenLine}
            />
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Business type</Label>
              <Select value={businessType} onValueChange={setBusinessType}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Industry type</Label>
              <Select value={industryType} onValueChange={setIndustryType}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {INDUSTRY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Registration type</Label>
              <Select value={registrationType} onValueChange={setRegistrationType}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {REGISTRATION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pan">PAN number</Label>
              <Input
                id="pan"
                name="pan"
                className="uppercase"
                placeholder="ABCDE1234F"
                defaultValue={tenant.pan ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="upi_id">UPI ID (invoice par payment QR ke liye)</Label>
              <Input
                id="upi_id"
                name="upi_id"
                placeholder="shopname@upi"
                defaultValue={tenant.upi_id ?? ""}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={gstRegistered}
                onChange={(e) => setGstRegistered(e.target.checked)}
              />
              GST registered
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={tds}
                onChange={(e) => setTds(e.target.checked)}
              />
              Enable TDS
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={tcs}
                onChange={(e) => setTcs(e.target.checked)}
              />
              Enable TCS
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="default_terms">Default Terms & Conditions (har naye invoice par)</Label>
            <Textarea
              id="default_terms"
              name="default_terms"
              rows={3}
              placeholder={"1. Goods once sold will not be taken back\n2. All disputes subject to local jurisdiction"}
              defaultValue={tenant.default_terms ?? ""}
            />
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save business details"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
