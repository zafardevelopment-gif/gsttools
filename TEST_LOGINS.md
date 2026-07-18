# Test Logins (temporary — dev only)

> ⚠️ Ye credentials sirf local testing ke liye hain (`NEXT_PUBLIC_AUTH_DISABLED=true`).
> Real auth on karne se pehle ye file delete kar dena aur passwords rotate kar dena.
>
> Note: dev-mode ab per-request `gst_dev_auth` cookie se decide hota hai
> (lib/dev-session.ts), na ki is global env flag se — isliye `/signup` se real
> Supabase signup ab is flag ki value se independent hamesha kaam karta hai.
> Ye flag sirf in dono hardcoded personas ke liye relevant hai.

| Role | Email | Password | Kahan jayega |
|---|---|---|---|
| **Super Admin** | `superadmin@aimunim.local` | `super123` | Login ke baad `/admin` kholen — saare tenants ka platform-level view |
| **End User** | `user@aimunim.local` | `user123` | `/dashboard` — demo business "Sharma Traders" ka owner |

## Notes

- Login page: <http://localhost:3000/login>
- Ye users `supabase/aimunim_final_schema.sql` run karne par `auth.users` me bhi ban jaate hain,
  isliye real auth (`NEXT_PUBLIC_AUTH_DISABLED=false`) me bhi yehi email+password chalenge.
  Super Admin ke liye tab `.env.local` me `SUPERADMIN_EMAILS=superadmin@aimunim.local` set karna hoga.
- Credentials override karne ke liye `.env.local` me: `DEV_SUPERADMIN_EMAIL`, `DEV_SUPERADMIN_PASSWORD`,
  `DEV_USER_EMAIL`, `DEV_USER_PASSWORD`.
- Demo tenant id: `11111111-1111-1111-1111-111111111111`
