"use client";

import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  businessSetupSchema,
  type BusinessSetupInput,
} from "@/lib/validation/onboarding";
import { createBusinessAction } from "@/server/actions/onboarding";
import { GST_STATE_CODES } from "@/lib/constants";
import { stateCodeFromGstin } from "@/lib/validation/common";
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

export function OnboardingForm() {
  const [pending, startTransition] = useTransition();
  const [stateCode, setStateCode] = useState<string>("");
  const logoRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<BusinessSetupInput>({
    resolver: zodResolver(businessSetupSchema),
    defaultValues: { name: "", state_code: "" },
  });

  function onSubmit(values: BusinessSetupInput) {
    const fd = new FormData();
    Object.entries(values).forEach(([k, val]) => {
      if (val != null) fd.set(k, String(val));
    });
    const file = logoRef.current?.files?.[0];
    if (file) fd.set("logo", file);

    startTransition(async () => {
      const res = await createBusinessAction(fd);
      // On success the action redirects; only errors return here.
      if (res?.error) toast.error(res.error);
    });
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name *" error={errors.name?.message}>
              <Input placeholder="Sharma Traders" {...register("name")} />
            </Field>
            <Field label="Legal name" error={errors.legal_name?.message}>
              <Input placeholder="Sharma Traders Pvt Ltd" {...register("legal_name")} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="State (place of supply) *" error={errors.state_code?.message}>
              <Select
                value={stateCode}
                onValueChange={(val) => {
                  setStateCode(val);
                  setValue("state_code", val, { shouldValidate: true });
                  const name = GST_STATE_CODES.find((s) => s.code === val)?.name;
                  if (name) setValue("state", name);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {GST_STATE_CODES.map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.code} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="GSTIN" error={errors.gstin?.message}>
              <Input
                placeholder="27ABCDE1234F1Z5"
                className="uppercase"
                {...register("gstin", {
                  onChange: (e) => {
                    const code = stateCodeFromGstin(e.target.value);
                    if (code && GST_STATE_CODES.some((s) => s.code === code)) {
                      setStateCode(code);
                      setValue("state_code", code, { shouldValidate: true });
                    }
                  },
                })}
              />
            </Field>
          </div>

          <Field label="Address line 1" error={errors.address_line1?.message}>
            <Input placeholder="Shop 14, MG Road" {...register("address_line1")} />
          </Field>
          <Field label="Address line 2" error={errors.address_line2?.message}>
            <Input {...register("address_line2")} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City" error={errors.city?.message}>
              <Input placeholder="Pune" {...register("city")} />
            </Field>
            <Field label="State name" error={errors.state?.message}>
              <Input placeholder="Maharashtra" {...register("state")} />
            </Field>
            <Field label="PIN code" error={errors.pincode?.message}>
              <Input placeholder="411001" {...register("pincode")} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" error={errors.phone?.message}>
              <Input placeholder="9876543210" {...register("phone")} />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" placeholder="owner@business.com" {...register("email")} />
            </Field>
          </div>

          <Field label="Logo (optional, ≤ 2 MB)">
            <Input ref={logoRef} type="file" accept="image/*" />
          </Field>

          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? "Creating…" : "Create business & continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
