# VetCare Admin Panel + Supabase Setup

This project now includes:
- Public website dynamic content/theme loading from Supabase
- Appointment submission to Supabase
- Admin panel (`admin.html`) for:
  - Accepting/denying appointments
  - Reviewing/resolving contact form messages
  - Editing text/buttons (all i18n keys)
  - Changing colors
  - Showing/hiding sections
  - Updating website images (hero slider, gallery, services image)
  - Updating button links (nav, hero, CTA)
  - Creating other admins (super admin only)
- Edge function email sending when appointment is accepted

## 1) Configure Supabase Project

1. Create a Supabase project.
2. Open SQL Editor and run:
- `supabase/schema.sql`

## 2) Configure Frontend Keys

Edit `supabase-config.js`:

```js
window.VETCARE_SUPABASE = {
    url: "https://YOUR_PROJECT_ID.supabase.co",
    anonKey: "YOUR_SUPABASE_ANON_KEY",
    functionsBaseUrl: "https://YOUR_PROJECT_ID.supabase.co/functions/v1"
};
```

## 3) Deploy Edge Functions

Deploy functions:
- `supabase/edge-functions/appointments-status`
- `supabase/edge-functions/invite-admin`
- `supabase/edge-functions/contact-message-notify`

Set function secrets:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY` (for acceptance email sending)
- `FROM_EMAIL` (verified sender in Resend)
- `ADMIN_NOTIFY_EMAILS` (optional comma-separated fallback list, e.g. `owner@site.com,manager@site.com`)

## 4) Create First Super Admin

Create a first user in Supabase Auth (email/password), then run this SQL with that user UUID:

```sql
insert into public.admin_profiles (user_id, role)
values ('FIRST_ADMIN_USER_ID', 'super_admin')
on conflict (user_id) do nothing;
```

## 5) Use Admin Panel

1. Open through a server URL (not file://), for example `http://localhost:5173/admin.html` or `/admin` on your deployed domain
2. Sign in as admin
3. Manage appointments/content/theme/media/links/admins

## Appointment Workflow

1. Visitor submits appointment form on website
2. Appointment is stored with status `pending`
3. Admin accepts/denies in `admin.html`
4. If accepted, edge function sends email to user

## Contact Message Workflow

1. Visitor submits contact form on website
2. Message is stored in `contact_messages` with status `new`
3. Website calls `contact-message-notify` edge function and emails admins
4. Admin reviews in `admin.html` Messages tab
5. Admin can mark each message as `resolved` or revert to `new`

## Notes

- Theme changes update common website class colors globally.
- Text/button edits use `content_overrides` and support `en`, `ar`, `ku`.
- Section toggles control visibility of `home`, `services`, `appointments`, `contact`.
- Media overrides are saved in `site_settings` key `image_overrides`.
- Button link overrides are saved in `site_settings` key `button_overrides`.
