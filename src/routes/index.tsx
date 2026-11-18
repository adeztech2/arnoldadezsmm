import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ADEZ SMM — Social media growth panel" },
      { name: "description", content: "Order followers, likes and views fast with ADEZ SMM." },
      { property: "og:title", content: "ADEZ SMM — Social media growth panel" },
      { property: "og:description", content: "Order followers, likes and views fast with ADEZ SMM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <h1 className="font-serif text-5xl text-foreground">ADEZ SMM</h1>
      <p className="mt-3 max-w-md text-muted-foreground">Grow your social media — fast, simple, affordable.</p>
      <Link to="/auth" className="mt-8 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground">
        Sign in / Create account
      </Link>
    </main>
  );
}
