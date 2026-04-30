import Link from "next/link";
import { Activity, Eye, FileText, HeartPulse, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    title: "Live human detection",
    description: "The scan flow responds when a real face is visible and properly positioned.",
    icon: Eye,
  },
  {
    title: "Visible feature review",
    description: "Aurveil focuses on visible signals such as skin tone, eyes, lips, symmetry, and posture.",
    icon: Activity,
  },
  {
    title: "Clear wellness report",
    description: "Results are written in simple language for awareness, not diagnosis.",
    icon: FileText,
  },
  {
    title: "Privacy-first flow",
    description: "Your live camera preview stays in the browser and no live video is stored.",
    icon: Lock,
  },
  {
    title: "Responsible guidance",
    description: "The platform avoids medical certainty and encourages professional care when needed.",
    icon: ShieldCheck,
  },
  {
    title: "Patient-friendly design",
    description: "Built for patients, doctors, and clinics to communicate visual observations clearly.",
    icon: HeartPulse,
  },
];

const steps = [
  "Enable camera",
  "Align face",
  "Run scan",
  "Review report",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-950">
              <Eye className="h-5 w-5 text-orange-500" />
            </span>
            <span className="font-serif text-3xl tracking-wide">
              Aur<span className="italic text-orange-500">veil</span>
            </span>
          </Link>

          <div className="hidden items-center gap-7 md:flex">
            <a href="#features" className="text-sm font-semibold text-slate-600 hover:text-slate-950">
              Features
            </a>
            <a href="#how-it-works" className="text-sm font-semibold text-slate-600 hover:text-slate-950">
              How it works
            </a>
            <Link href="/platform" className="text-sm font-semibold text-slate-600 hover:text-slate-950">
              Wellness Platform
            </Link>
          </div>

          <Button asChild className="rounded-xl bg-orange-500 px-5 font-bold text-white hover:bg-orange-600">
            <Link href="/scanner">Start Scan</Link>
          </Button>
        </div>
      </nav>

      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-orange-50 via-white to-white pt-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,107,53,0.14),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(15,23,42,0.08),transparent_28%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-extrabold text-slate-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Private visual health scan
            </div>

            <h1 className="max-w-3xl font-serif text-6xl font-normal leading-[0.95] tracking-[-0.04em] text-slate-950 md:text-7xl">
              Check visible health signals in{" "}
              <span className="italic text-orange-500">seconds</span>.
            </h1>

            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600">
              Aurveil reviews visible signs such as skin tone, eyes, lips, facial symmetry,
              neck area, and posture. It gives you a simple awareness report, not a diagnosis.
            </p>

            <div className="mt-9 flex flex-wrap gap-4">
              <Button asChild size="lg" className="rounded-2xl bg-orange-500 px-8 font-extrabold text-white shadow-xl shadow-orange-500/20 hover:bg-orange-600">
                <Link href="/scanner">Start Free Scan →</Link>
              </Button>

              <Button asChild size="lg" variant="outline" className="rounded-2xl px-8 font-extrabold">
                <a href="#how-it-works">See How It Works</a>
              </Button>
            </div>

            <div className="mt-8 flex flex-wrap gap-5 text-sm font-bold text-slate-500">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                No signup required
              </span>
              <span className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-emerald-500" />
                No live video stored
              </span>
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-500" />
                Awareness only
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="relative min-h-[500px] overflow-hidden rounded-[2.5rem] bg-slate-950 shadow-2xl">
              <img
                src="https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&w=1100&q=80"
                alt="Human face visual health scan preview"
                className="h-[500px] w-full object-cover opacity-90"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-slate-950/5 to-slate-950/70" />
              <div className="absolute inset-10 rounded-[2rem] border border-white/30" />
              <div className="absolute left-10 right-10 top-1/2 h-[2px] bg-gradient-to-r from-transparent via-orange-500 to-transparent shadow-[0_0_24px_rgba(255,107,53,0.9)]" />
            </div>

            <div className="absolute -bottom-7 -left-7 w-[320px] rounded-3xl border border-white/70 bg-white/95 p-5 shadow-2xl backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-950">
                  Sample Report
                </span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black text-emerald-600">
                  Ready
                </span>
              </div>
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full w-[84%] rounded-full bg-gradient-to-r from-orange-500 to-emerald-500" />
              </div>
              <div className="grid gap-2 text-xs font-bold text-slate-500">
                <div className="flex justify-between">
                  <span>Face alignment</span>
                  <strong className="text-slate-950">Centered</strong>
                </div>
                <div className="flex justify-between">
                  <span>Lighting quality</span>
                  <strong className="text-slate-950">Good</strong>
                </div>
                <div className="flex justify-between">
                  <span>Privacy mode</span>
                  <strong className="text-slate-950">Enabled</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mx-auto grid max-w-7xl grid-cols-2 gap-4 px-6 pb-16 md:grid-cols-4">
          {[
            ["7", "Visible areas checked"],
            ["30s", "Typical scan time"],
            ["0", "Live videos stored"],
            ["100%", "Awareness focused"],
          ].map(([num, label]) => (
            <div key={label} className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <span className="block text-3xl font-black tracking-tight text-slate-950">{num}</span>
              <span className="mt-1 block text-xs font-bold text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-orange-500">
            What Aurveil does
          </p>
          <h2 className="font-serif text-5xl font-normal tracking-tight text-slate-950">
            A simple scan with clear results.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-600">
            Designed to be calm, understandable, and useful without making medical claims.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                className="rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:border-orange-300 hover:shadow-xl"
              >
                <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-orange-50 text-orange-500">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-black text-slate-950">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{feature.description}</p>
                <span className="mt-5 inline-flex rounded-full bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-orange-500">
                  Included
                </span>
              </article>
            );
          })}
        </div>
      </section>

      <section id="how-it-works" className="bg-slate-950 px-6 py-24 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-orange-500">
              How it works
            </p>
            <h2 className="font-serif text-5xl font-normal tracking-tight">
              From camera to report in four steps.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-400">
              No download, no complicated setup, and no unnecessary wording.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-4">
            {steps.map((step, index) => (
              <article key={step} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <div className="mb-5 grid h-12 w-12 place-items-center rounded-full border border-orange-500/30 bg-orange-500/10 text-sm font-black text-orange-500">
                  {index + 1}
                </div>
                <h3 className="font-black">{step}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  Follow the guided process to complete your visual wellness scan.
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-br from-slate-950 to-slate-800 px-6 py-24 text-center text-white">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-serif text-5xl font-normal tracking-tight">
            Ready to run your <span className="italic text-orange-500">visual scan?</span>
          </h2>
          <p className="mt-5 text-base leading-7 text-slate-400">
            Start with your camera, get a clear report, and use it as a wellness awareness tool.
          </p>
          <Button asChild size="lg" className="mt-9 rounded-2xl bg-orange-500 px-8 font-extrabold text-white hover:bg-orange-600">
            <Link href="/scanner">Start Free Scan →</Link>
          </Button>
          <p className="mt-6 text-xs leading-6 text-slate-500">
            Aurveil is not a medical device and does not provide diagnosis or treatment.
            For urgent symptoms or medical concerns, contact a licensed healthcare professional.
          </p>
        </div>
      </section>

      <footer className="bg-slate-950 px-6 py-10 text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 md:flex-row md:items-center">
          <span className="font-serif text-2xl text-slate-200">
            Aur<span className="italic text-orange-500">veil</span>
          </span>
          <span className="text-xs">© 2026 Onada Innovative Ltd. All rights reserved.</span>
        </div>
      </footer>
    </main>
  );
}
