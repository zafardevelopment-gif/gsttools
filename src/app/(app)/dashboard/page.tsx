import { getAppContext } from "@/server/queries/app-context";

export const metadata = { title: "Dashboard · GST Billing" };

export default async function DashboardPage() {
  const ctx = await getAppContext();
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">
        Welcome, {ctx.activeTenant.name}
      </h1>
      <p className="text-muted-foreground">
        Your dashboard with sales, dues, collections and stock value lands in
        Step 9. Use the sidebar to manage items, parties, invoices and more.
      </p>
    </div>
  );
}
