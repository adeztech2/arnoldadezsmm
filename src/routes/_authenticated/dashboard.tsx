import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — ADEZ SMM" }] }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);
  return (
    <main className="min-h-screen bg-background p-6">
      <h1 className="font-serif text-3xl text-foreground">Welcome</h1>
      <p className="mt-2 text-muted-foreground">Signed in as {email}</p>
      <button
        onClick={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth", replace: true });
        }}
        className="mt-6 rounded-lg border border-border px-4 py-2 text-foreground"
      >
        Sign out
      </button>
    </main>
  );
}
