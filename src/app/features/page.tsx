import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Activity, Eye, FileText, HeartPulse, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type Feature = {
  title: string;
  description: string;
  icon: LucideIcon;
};

const features: Feature[] = [
  {
    title: "Live Human Detection",
    description: "Detects when a face is visible and positioned well enough for a scan.",
    icon: Eye,
  },
  {
    title: "Visual Wellness Signals",
    description: "Reviews visible appearance indicators like eyes, skin tone, posture, and face alignment.",
    icon: Activity,
  },
  {
    title: "Guided Multi-Stage Scan",
    description: "Walks users through face, eye, hand, finger, and posture scan stages.",
    icon: HeartPulse,
  },
  {
    title: "Wellness Report",
    description: "Generates a clear visual awareness report without making medical diagnosis claims.",
    icon: FileText,
  },
  {
    title: "Privacy-First",
    description: "No live video is stored. Camera preview stays in the browser.",
    icon: Lock,
  },
  {
    title: "Responsible AI Safety",
    description: "Uses non-diagnostic language and encourages professional care when needed.",
    icon: ShieldCheck,
  },
];

export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <nav className="flex items-center justify-between border-b px-8 py-4">
        <Link href="/" className="font-serif text-3xl">
          Aur<span className="italic text-orange-500">veil</span>
        </Link>
        <Button asChild className="bg-orange-500 hover:bg-orange-600">
          <Link href="/scanner">Start Scan</Link>
        </Button>
      </nav>

      <section className="mx-auto max-w-7xl px-6 py-20">
        <p className="text-sm font-black uppercase tracking-[0.2em] text-orange-500">Features</p>
        <h1 className="mt-4 max-w-3xl font-serif text-6xl leading-tight">
          Built for private visual wellness awareness.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
          Aurveil combines guided camera flow, scan quality scoring, and responsible AI-style wellness reporting.
        </p>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <article key={feature.title} className="rounded-3xl border bg-white p-7 shadow-sm">
                <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-orange-50 text-orange-500">
                  <Icon className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-black">{feature.title}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">{feature.description}</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
