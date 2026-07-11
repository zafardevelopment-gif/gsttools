import { requireRouteAccess } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { listMembers, listActivity } from "@/server/queries/users";
import { InviteUserDialog, MembersTable } from "./users-client";

export const metadata = { title: "Manage Users · AI Munim" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requireRouteAccess("/users");
  const [members, activity] = await Promise.all([listMembers(), listActivity(50)]);

  return (
    <div>
      <PageHeader
        title="Manage Users"
        description="Team members, roles, and the activity tracker."
        action={<InviteUserDialog />}
      />

      {members.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          No members found. (Dev mode note: members appear after the SQL setup
          creates auth users and memberships.)
        </div>
      ) : (
        <MembersTable members={members} />
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-muted-foreground">
        Activity tracker
      </h2>
      {activity.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No activity yet. Actions like invoice creation and user changes will
          appear here.
        </div>
      ) : (
        <div className="space-y-2">
          {activity.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <Badge variant="secondary">{a.action}</Badge>
              <span className="text-muted-foreground">
                {a.user_email ?? "system"}
              </span>
              {a.data ? (
                <span className="truncate text-xs text-muted-foreground">
                  {JSON.stringify(a.data)}
                </span>
              ) : null}
              <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                {a.created_at.slice(0, 16).replace("T", " ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
