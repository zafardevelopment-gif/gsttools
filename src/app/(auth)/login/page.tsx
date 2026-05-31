"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type Channel = "phone" | "email";

/** Normalise a 10-digit Indian number to E.164 (+91…). Leaves +-prefixed as-is. */
function toE164(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/\s/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";

  const [channel, setChannel] = useState<Channel>("phone");
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  async function sendOtp() {
    if (!identifier.trim()) {
      toast.error(`Please enter your ${channel}.`);
      return;
    }
    setLoading(true);
    try {
      const payload =
        channel === "phone"
          ? { phone: toE164(identifier) }
          : { email: identifier.trim() };
      const { error } = await supabase.auth.signInWithOtp(payload);
      if (error) throw error;
      setOtpSent(true);
      toast.success(`OTP sent to your ${channel}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    if (otp.trim().length < 4) {
      toast.error("Enter the OTP code.");
      return;
    }
    setLoading(true);
    try {
      const { error } =
        channel === "phone"
          ? await supabase.auth.verifyOtp({
              phone: toE164(identifier),
              token: otp.trim(),
              type: "sms",
            })
          : await supabase.auth.verifyOtp({
              email: identifier.trim(),
              token: otp.trim(),
              type: "email",
            });
      if (error) throw error;
      toast.success("Logged in.");
      router.push(next);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid OTP.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setOtpSent(false);
    setOtp("");
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Log in or sign up</CardTitle>
        <CardDescription>
          We&apos;ll send a one-time code to verify you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isSupabaseConfigured && (
          <p className="rounded-md bg-yellow-50 p-3 text-xs text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
            Supabase isn&apos;t configured yet. Add your keys to{" "}
            <code>.env.local</code> and restart to enable login.
          </p>
        )}

        <Tabs
          value={channel}
          onValueChange={(v) => {
            setChannel(v as Channel);
            reset();
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="phone">Phone</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
          </TabsList>

          <TabsContent value="phone" className="pt-4">
            <Label htmlFor="phone">Mobile number</Label>
            <Input
              id="phone"
              inputMode="tel"
              placeholder="9876543210"
              value={channel === "phone" ? identifier : ""}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={otpSent || loading}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Indian numbers auto-prefixed with +91.
            </p>
          </TabsContent>

          <TabsContent value="email" className="pt-4">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@business.com"
              value={channel === "email" ? identifier : ""}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={otpSent || loading}
            />
          </TabsContent>
        </Tabs>

        {otpSent && (
          <div className="space-y-1.5">
            <Label htmlFor="otp">Enter OTP</Label>
            <Input
              id="otp"
              inputMode="numeric"
              placeholder="6-digit code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              disabled={loading}
            />
          </div>
        )}

        {!otpSent ? (
          <Button className="w-full" onClick={sendOtp} disabled={loading || !isSupabaseConfigured}>
            {loading ? "Sending…" : "Send OTP"}
          </Button>
        ) : (
          <div className="space-y-2">
            <Button className="w-full" onClick={verifyOtp} disabled={loading}>
              {loading ? "Verifying…" : "Verify & continue"}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={reset}
              disabled={loading}
            >
              Use a different {channel}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
