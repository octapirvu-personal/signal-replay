# Supabase setup — multi-device cloud persistence

This wires Signal Replay to a hosted Postgres + Auth so your datasets and
annotations follow you across devices (cloud-only, simple email + password).

Do these steps once. They're the parts only you can do (they need your
accounts); the app-side code is built against the keys you produce here.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> → sign in → **New project**.
2. Pick a name (e.g. `signal-replay`), a strong DB password, and a region near you.
3. Wait for it to provision (~2 min).

## 2. Create the database schema

1. In the project: **SQL Editor** → **New query**.
2. Paste the entire contents of [`schema.sql`](./schema.sql) and click **Run**.
3. You should see "Success". This creates the 3 tables (`datasets`,
   `decisions`, `kv`) and their row-level-security policies.

## 3. Enable email + password sign-in (no email delivery needed)

1. **Authentication → Providers → Email** → make sure it's **Enabled** (it is by
   default).
2. Turn **Confirm email** *off* — this skips the confirmation-link step, so you
   can sign up and log in instantly without any email actually being delivered.
   - It's under **Authentication → Providers → Email** (toggle "Confirm email"),
     or **Authentication → Settings** depending on your dashboard version.

That's it — no OAuth, no external console. You'll create one account (any email +
password) from the app's sign-in screen and use the same credentials on every
device.

## 4. Get your project API keys

1. **Project Settings → API**.
2. Copy the **Project URL** and the **anon public** key (the anon key is safe to
   ship in a frontend — RLS is what protects the data).

## 5. Add the keys to the app

Create a `.env.local` file in the project root (it's gitignored) with:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
```

See [`.env.example`](../.env.example) for the template.

---

## Then tell me

Once steps 1–5 are done, let me know (the schema ran cleanly + the `.env.local`
exists) and I'll build and verify the client integration:

- a Supabase client + email/password auth gate (sign-up / sign-in screen),
- a cloud persistence layer replacing the IndexedDB calls in `src/persistence/db.ts`,
- a dataset switcher (list / open / delete your saved symbols).

### Notes
- **Cost:** the free tier (500 MB DB + 1 GB storage) is plenty for personal use.
- **Privacy:** your data lives on Supabase's servers (US/EU region you picked),
  not just your browser. RLS means only your logged-in account can read it.
- **Migrating existing local data:** your current IndexedDB data stays in your
  browser. When the integration lands I can add a one-time "push my local data to
  the cloud" button so you don't lose what you've already recorded.
