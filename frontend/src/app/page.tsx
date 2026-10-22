import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Camera,
  Video,
  MapPin,
  Cpu,
  ArrowRight,
  Download,
  Route,
} from 'lucide-react';

const workflows = [
  {
    icon: Camera,
    title: 'Image',
    description: 'Drop in a photo — each pothole is boxed, scored for severity, and kept with its coordinates.',
    href: '/detect/image',
  },
  {
    icon: Video,
    title: 'Video',
    description: 'Dashcam footage is processed frame by frame with tracking, so one pothole is logged once.',
    href: '/detect/video',
  },
  {
    icon: Route,
    title: 'Live',
    description: 'Run detection from a phone or webcam while driving; detections stream in as you go.',
    href: '/detect/live',
  },
  {
    icon: MapPin,
    title: 'Map',
    description: 'Everything lands on a map, clustered by location and ready to hand to a road crew.',
    href: '/map',
  },
];

const steps = [
  {
    step: 'Capture',
    description: 'Upload photos or video, or open the live camera on any device with a browser.',
    icon: Camera,
  },
  {
    step: 'Analyze',
    description: 'A YOLO model finds each pothole, tracks it across frames, and estimates severity.',
    icon: Cpu,
  },
  {
    step: 'Locate',
    description: 'GPS is attached automatically so every detection has a place on the map.',
    icon: MapPin,
  },
  {
    step: 'Report',
    description: 'Filter by severity and location, then export CSV or PDF for the authorities.',
    icon: Download,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between rounded-2xl border border-border bg-card px-5 shadow-[var(--shadow-card)]">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 17c2-1 3-3 4-5" />
                <path d="M9 12c1.5-2.5 4-4 7-4" />
                <path d="M16 8c2 0 4 1 5 3" />
                <circle cx="19" cy="11" r="1" />
                <circle cx="9" cy="12" r="1" />
                <circle cx="4" cy="17" r="1" />
              </svg>
            </span>
            SmartPothole
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {[
              { href: '#workflows', label: 'Product' },
              { href: '#how', label: 'How it works' },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/auth/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-4 pb-24 pt-44 md:pt-52">
        <div className="mx-auto max-w-3xl text-center">
          {/* Airaa-style tag */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
            <span className="text-xs font-medium text-primary uppercase tracking-wider">AI-Powered Detection</span>
          </div>
          <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">
            Find every pothole
            <br />
            before it becomes a claim.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-balance text-base leading-relaxed text-muted-foreground md:text-lg">
            SmartPothole turns photos, dashcam video, and live camera feeds into a
            mapped, severity-ranked record of road damage — no survey crew required.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="xl" asChild>
              <Link href="/auth/signup">
                Start detecting <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="xl" variant="outline" asChild>
              <Link href="/auth/login">Sign in</Link>
            </Button>
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            Free while in development · Runs locally with your own YOLO weights
          </p>
        </div>
      </section>

      {/* Workflows */}
      <section id="workflows" className="scroll-mt-28 px-4 pb-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 flex items-end justify-between gap-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                Four ways in, one record out
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base">
                However the footage arrives, it ends up in the same place: a deduplicated,
                geotagged list you can act on.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {workflows.map((w) => (
              <Link key={w.title} href={w.href} className="group focus-visible:outline-none">
                <Card className="h-full transition-all duration-300 hover:border-primary/20">
                  <CardContent className="flex gap-4 p-6">
                    <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                      <w.icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-medium">
                        {w.title}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </span>
                      <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground">
                        {w.description}
                      </span>
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-28 px-4 pb-28">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            From footage to work order
          </h2>
          <div className="mt-10 grid gap-10 md:grid-cols-4 md:gap-6">
            {steps.map((s, i) => (
              <div key={s.step} className="relative">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <s.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="mt-4 font-medium">{s.step}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 pb-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 rounded-2xl border border-border bg-card px-6 py-5 text-sm text-muted-foreground shadow-[var(--shadow-card)] sm:flex-row">
          <span>© {new Date().getFullYear()} SmartPothole — an open-source road survey tool.</span>
          <span className="flex items-center gap-5">
            <Link href="/auth/login" className="transition-colors hover:text-foreground">
              Sign in
            </Link>
            <Link href="/map" className="transition-colors hover:text-foreground">
              Map
            </Link>
            <Link href="/dashboard" className="transition-colors hover:text-foreground">
              Dashboard
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
