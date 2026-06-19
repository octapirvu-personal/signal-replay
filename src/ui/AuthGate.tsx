import { useState } from "react";
import { useAuth } from "../state/auth";
import { isSupabaseConfigured } from "../persistence/supabase";

/** Sign-in / sign-up screen shown until the user has a Supabase session. */
export function AuthGate() {
  const signIn = useAuth((s) => s.signIn);
  const signUp = useAuth((s) => s.signUp);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = mode === "in" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (error) setMsg(error);
    else if (mode === "up") setMsg("Account created — signing you in…");
    // on success the auth listener swaps this screen out automatically
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="flex h-full items-center justify-center bg-bg p-6 text-center text-sm text-sell">
        Supabase isn’t configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local and restart the dev server.
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-bg">
      <form onSubmit={submit} className="w-[320px] rounded-lg border border-line bg-panel p-6">
        <div className="mb-1 text-lg font-semibold text-ink">Signal Replay</div>
        <div className="mb-4 text-xs text-muted">{mode === "in" ? "Sign in to your account" : "Create an account"}</div>

        <label className="mb-1 block stat-k">Email</label>
        <input
          type="email"
          autoComplete="email"
          required
          className="mb-3 w-full rounded-md border border-line bg-bg px-2 py-1.5 text-[13px] text-ink"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="mb-1 block stat-k">Password</label>
        <input
          type="password"
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          required
          minLength={6}
          className="mb-4 w-full rounded-md border border-line bg-bg px-2 py-1.5 text-[13px] text-ink"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit" disabled={busy} className="btn btn-primary w-full">
          {busy ? "…" : mode === "in" ? "Sign in" : "Sign up"}
        </button>

        {msg && <div className="mt-3 text-xs text-sell">{msg}</div>}

        <button
          type="button"
          className="mt-4 w-full text-center text-xs text-muted hover:text-ink"
          onClick={() => {
            setMode((m) => (m === "in" ? "up" : "in"));
            setMsg(null);
          }}
        >
          {mode === "in" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
