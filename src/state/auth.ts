import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../persistence/supabase";

/** Auth session state for the email/password sign-in gate. */
interface AuthStore {
  session: Session | null;
  /** True once the initial session lookup has completed (avoids a sign-in flash). */
  ready: boolean;
  init(): void;
  signIn(email: string, password: string): Promise<{ error?: string }>;
  signUp(email: string, password: string): Promise<{ error?: string }>;
  signOut(): Promise<void>;
}

let initialized = false;

export const useAuth = create<AuthStore>((set) => ({
  session: null,
  ready: false,

  init() {
    if (initialized) return;
    initialized = true;
    void supabase.auth.getSession().then(({ data }) => set({ session: data.session, ready: true }));
    supabase.auth.onAuthStateChange((_event, session) => set({ session, ready: true }));
  },

  async signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message };
  },

  async signUp(email, password) {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message };
  },

  async signOut() {
    await supabase.auth.signOut();
  },
}));
