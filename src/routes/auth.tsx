import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — ADEZ SMM" },
      { name: "description", content: "Sign in or create your ADEZ SMM account." },
      { property: "og:title", content: "Sign in — ADEZ SMM" },
      { property: "og:description", content: "Sign in or create your ADEZ SMM account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message);
      else navigate({ to: "/dashboard" });
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + "/dashboard" },
      });
      setMsg(error ? error.message : "Check your email to confirm your account.");
    }
    setBusy(false);
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r && "error" in r && r.error) setMsg(String(r.error));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="font-serif text-3xl text-foreground">ADEZ SMM</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "in" ? "Sign in to your account" : "Create a new account"}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground" />
          <input type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground" />
          <button disabled={busy} className="w-full rounded-lg bg-primary py-2 font-medium text-primary-foreground disabled:opacity-60">
            {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button onClick={google} className="mt-3 w-full rounded-lg border border-border py-2 text-foreground">
          Continue with Google
        </button>
        {msg && <p className="mt-3 text-sm text-muted-foreground">{msg}</p>}
        <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 text-sm text-primary underline">
          {mode === "in" ? "No account? Create one" : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
