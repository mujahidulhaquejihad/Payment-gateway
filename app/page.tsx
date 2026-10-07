import Link from "next/link";
import { btnLg, card, Icon, type IconName, Logo, ProviderMark } from "@/app/ui";

const steps: [string, string][] = [
  ["Sign up in 2 minutes", "Just your business name and mobile number. Start with test payments right away."],
  ["Share your link", "Post it on Facebook, Instagram or WhatsApp, or send it by SMS."],
  ["Get paid next day", "Money lands in your bank, bKash or Nagad account the next business day."],
];

const features: [IconName, string, string][] = [
  ["wallet", "Every wallet, one link", "Buyers pay with bKash, Nagad, Rocket, Upay or Visa/Mastercard."],
  ["bolt", "No website needed", "Payment links work anywhere you sell, even in a chat."],
  ["bank", "Next-day payouts", "T+1 settlement with a downloadable statement for every payout."],
  ["shield", "Bank-grade security", "Buyers confirm on their wallet's own page. We never see PINs or card numbers."],
  ["chart", "Know your numbers", "Daily sales, best payment methods and repeat customers at a glance."],
  ["team", "Built for teams", "Give staff their own login with owner, manager or viewer access."],
];

export default function Home() {
  return (
    <main className="flex-1 overflow-hidden">
      <section className="relative isolate overflow-hidden bg-slate-950 text-white">
        <div aria-hidden className="absolute inset-0 -z-10 bg-dots-light [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <div aria-hidden className="absolute -top-40 left-1/2 -z-10 h-[32rem] w-[60rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-500/30 via-teal-400/20 to-sky-500/20 blur-3xl" />

        <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Logo />
          <nav className="flex items-center gap-1">
            <Link href="/login" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:text-white">Log in</Link>
            <Link href="/signup" className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-200">Get started</Link>
          </nav>
        </header>

        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-24 pt-12 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
          <div className="animate-rise">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/[.06] px-3 py-1 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-white/10">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />Built for Bangladesh&apos;s small businesses
            </span>
            <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-7xl">
              Get paid online.
              <br />
              <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-sky-300 bg-clip-text text-transparent">No website needed.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-slate-400">
              One payment link for f-commerce sellers, tutors and small shops. ছোট ব্যবসার জন্য সহজ অনলাইন পেমেন্ট।
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/signup" className={btnLg}>Create free account<Icon name="arrow" className="h-4 w-4" /></Link>
              <span className="text-sm text-slate-500">No setup or monthly fee</span>
            </div>
            <div className="mt-12 flex items-center gap-2">
              {["bkash", "nagad", "rocket", "upay", "card"].map((id) => <ProviderMark key={id} id={id} className="h-9 w-9 text-[10px] ring-2 ring-slate-950" />)}
              <span className="ml-2 text-sm text-slate-500">All major wallets & cards</span>
            </div>
          </div>

          <div aria-hidden className="relative mx-auto w-full max-w-sm animate-rise [animation-delay:150ms]">
            <div className="absolute inset-0 -z-10 translate-y-6 scale-95 rounded-3xl bg-emerald-500/30 blur-2xl" />
            <div className="animate-float rounded-3xl bg-white p-6 text-slate-900 shadow-2xl ring-1 ring-white/10">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 font-semibold text-white">R</span>
                <div>
                  <p className="text-xs text-slate-500">Paying</p>
                  <p className="font-semibold">Rupa Fashion House</p>
                </div>
                <Icon name="shield" className="ml-auto h-5 w-5 text-emerald-600" />
              </div>
              <div className="mt-5 rounded-2xl bg-slate-50 py-5 text-center ring-1 ring-inset ring-slate-900/5">
                <p className="text-xs uppercase tracking-wider text-slate-500">Handmade saree</p>
                <p className="mt-1 text-4xl font-semibold tracking-tight">৳1,500.00</p>
              </div>
              <div className="mt-4 space-y-2">
                {[["bkash", "bKash"], ["nagad", "Nagad"], ["card", "Visa / Mastercard"]].map(([id, name], i) => (
                  <div key={id} className={`flex items-center gap-3 rounded-xl p-2.5 ring-1 ${i === 0 ? "bg-emerald-50/60 ring-emerald-500/40" : "ring-slate-900/10"}`}>
                    <ProviderMark id={id} className="h-8 w-8 text-[9px]" />
                    <span className="flex-1 text-sm font-medium">{name}</span>
                    <Icon name="arrow" className={`h-4 w-4 ${i === 0 ? "text-emerald-600" : "text-slate-300"}`} />
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-6 -left-8 flex items-center gap-3 rounded-2xl bg-white/90 px-4 py-3 text-slate-900 shadow-xl ring-1 ring-slate-900/5 backdrop-blur">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white"><Icon name="check" className="h-4 w-4" /></span>
              <div>
                <p className="text-sm font-semibold">Payment received</p>
                <p className="text-xs text-slate-500">৳1,500 via bKash · just now</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto max-w-6xl px-5">
          <p className="text-center text-sm font-semibold text-emerald-600">How it works</p>
          <h2 className="mt-2 text-center text-4xl font-semibold tracking-[-0.02em]">Start selling in three steps</h2>
          <div className="relative mt-14">
          <div aria-hidden className="absolute left-[16%] right-[16%] top-6 hidden h-px bg-gradient-to-r from-transparent via-emerald-300 to-transparent md:block" />
          <ol className="grid gap-6 md:grid-cols-3">
            {steps.map(([t, d], i) => (
              <li key={t} className="relative text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 text-lg font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/.25),0_8px_20px_-6px_rgb(5_150_105/.6)]">{i + 1}</span>
                <h3 className="mt-5 font-semibold">{t}</h3>
                <p className="mx-auto mt-1.5 max-w-xs text-sm text-slate-500">{d}</p>
              </li>
            ))}
          </ol>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24">
        <p className="text-center text-sm font-semibold text-emerald-600">Features</p>
        <h2 className="mt-2 text-center text-4xl font-semibold tracking-[-0.02em]">Everything you need to get paid</h2>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(([icon, t, d]) => (
            <div key={t} className={`${card} group transition duration-200 hover:-translate-y-1 hover:ring-emerald-500/30`}>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/10 transition group-hover:from-emerald-500 group-hover:to-teal-600 group-hover:text-white">
                <Icon name={icon} />
              </span>
              <h3 className="mt-5 font-semibold">{t}</h3>
              <p className="mt-1.5 text-sm text-slate-500">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="relative isolate overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-16 text-center text-white sm:px-12">
          <div aria-hidden className="absolute inset-0 -z-10 bg-dots-light [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
          <div aria-hidden className="absolute -bottom-32 left-1/2 -z-10 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-emerald-500/25 blur-3xl" />
          <h2 className="text-4xl font-semibold tracking-[-0.02em]">Simple, honest pricing</h2>
          <p className="mt-3 text-slate-400">No setup fee. No monthly fee. Pay only when you get paid.</p>
          <div className="mx-auto mt-12 grid max-w-2xl gap-4 sm:grid-cols-2">
            {[["bKash · Nagad · Rocket · Upay", "1.85%"], ["Visa · Mastercard", "2.30%"]].map(([what, rate]) => (
              <div key={rate} className="rounded-2xl bg-white/[.04] p-7 ring-1 ring-inset ring-white/10 backdrop-blur">
                <p className="text-sm text-slate-400">{what}</p>
                <p className="mt-3 bg-gradient-to-b from-white to-slate-400 bg-clip-text text-6xl font-semibold tracking-tight text-transparent">{rate}</p>
                <p className="mt-2 text-xs text-slate-500">per successful payment</p>
              </div>
            ))}
          </div>
          <Link href="/signup" className={`${btnLg} mt-12`}>Get started free<Icon name="arrow" className="h-4 w-4" /></Link>
        </div>
      </section>

      <footer className="border-t border-slate-900/[.06] py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 text-xs text-slate-400 sm:flex-row">
          <Logo className="text-sm text-slate-900" />
          <p>Sandbox MVP. Live processing requires a Bangladesh Bank PSO license.</p>
        </div>
      </footer>
    </main>
  );
}
