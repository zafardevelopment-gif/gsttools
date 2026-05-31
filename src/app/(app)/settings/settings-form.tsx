"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateBusinessAction } from "@/server/actions/settings";
import { GST_STATE_CODES } from "@/lib/constants";
import { stateCodeFromGstin } from "@/lib/validation/common";
import type { TenantRow } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SettingsForm({ tenant }: { tenant: TenantRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stateCode, setStateCode] = useState(tenant.state_code ?? "");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("state_code", stateCode);
    startTransition(async () => {
      const res = await updateBusinessAction(fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Business details saved.");
        router.refresh();
      }
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name *">
              <Input name="name" defaultValue={tenant.name} required />
            </Field>
            <Field label="Legal name">
              <Input name="legal_name" defaultValue={tenant.legal_name ?? ""} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="State *">
              <Select value={stateCode} onValueChange={setStateCode}>
                <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {GST_STATE_CODES.map((s) => (
                    <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="GSTIN">
              <Input
                name="gstin"
                className="uppercase"
                defaultValue={tenant.gstin ?? ""}
                onChange={(e) => {
                  const code = stateCodeFromGstin(e.target.value);
                  if (code && GST_STATE_CODES.some((s) => s.code === code)) setStateCode(code);
                }}
              />
            </Field>
          </div>
          <Field label="Address line 1">
            <Input name="address_line1" defaultValue={tenant.address_line1 ?? ""} />
          </Field>
          <Field label="Address line 2">
            <Input name="address_line2" defaultValue={tenant.address_line2 ?? ""} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City"><Input name="city" defaultValue={tenant.city ?? ""} /></Field>
            <Field label="State name"><Input name="state" defaultValue={tenant.state ?? ""} /></Field>
            <Field label="PIN code"><Input name="pincode" defaultValue={tenant.pincode ?? ""} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Phone"><Input name="phone" defaultValue={tenant.phone ?? ""} /></Field>
            <Field label="Email"><Input name="email" type="email" defaultValue={tenant.email ?? ""} /></Field>
            <Field label="Invoice prefix">
              <Input name="invoice_prefix" defaultValue={tenant.invoice_prefix} />
            </Field>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
