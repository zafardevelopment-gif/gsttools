import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveContext } from "@/lib/tenant";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Set up your business · GST Billing" };

export default async function OnboardingPage() {
  await requireUser();
  // If they already have a business, skip onboarding.
  const ctx = await getActiveContext();
  if (ctx) redirect("/dashboard");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Set up your business</h1>
        <p className="text-muted-foreground">
          A few details to start invoicing. You can edit these later in Settings.
        </p>
      </div>
      <OnboardingForm />
    </div>
  );
}
