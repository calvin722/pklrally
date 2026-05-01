import Link from "next/link";
import Wordmark from "@/components/Wordmark";

export const metadata = {
  title: "How PKLRALLY works — Play, Track & Win",
};

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-black px-4 pb-24 pt-6 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-pickle hover:opacity-80">
          <span aria-hidden className="font-display text-display-sm font-bold">←</span>
          <Wordmark size="xs" />
          <span className="sr-only">Back to PKLRALLY home</span>
        </Link>

        <header className="mt-8">
          <p className="font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
            How it works
          </p>
          <h1 className="mt-1 font-display text-display-3xl font-extrabold uppercase tracking-tight text-bright sm:text-display-4xl">
            Play, Track &amp; Win
          </h1>
        </header>

        {/* THE THREE STEPS */}
        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          <Step
            number="1"
            title="Play"
            body="Show up at any local court. Doubles, with anyone — friends, strangers, anyone who picks up a paddle."
          />
          <Step
            number="2"
            title="Track"
            body="After the match, log it on PKLRALLY. Pick the players, type the score, hit save. The other team vouches the score, and it counts."
          />
          <Step
            number="3"
            title="Win"
            body="The top three on your city's ladder at the end of each month win sponsor prizes. New month, fresh ladder."
          />
        </section>

        {/* DETAIL */}
        <section className="mt-10 space-y-6 text-base leading-relaxed text-white/80">
          <p>
            PKLRALLY is the social map of pickleball. Every city has its own
            monthly ladder, and your record is whatever you log at courts in
            that city. Play casually, log when you remember, and your stats
            build over the month.
          </p>
          <p>
            <span className="text-pickle font-bold">Free for players</span> —
            the sponsorship model funds the prizes, not subscriptions. Local
            businesses sponsor the top three places each month and provide
            the gift cards or paddles you compete for.
          </p>
          <p>
            Vouching keeps it honest. After you log a match, the opposing
            team gets a quick prompt to confirm the score. Once vouched, it
            counts toward stats and the ladder. If they dispute it, you get
            a chance to fix the score and resubmit.
          </p>
        </section>

        {/* SCORING */}
        <section className="mt-10 rounded-2xl border-2 border-white/15 bg-white/[0.03] p-5">
          <h2 className="font-display text-display-md font-extrabold uppercase tracking-wide text-pickle">
            How the ranking works
          </h2>

          <div className="mt-4 rounded-xl border-2 border-pickle bg-black p-4 text-center">
            <p className="font-mono text-base text-bright sm:text-lg">
              score = weighted&nbsp;wins × win&nbsp;rate
            </p>
            <p className="mt-1 font-mono text-xs text-white/60">
              weighted wins = sum of each win, weighted by team rating gap
            </p>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-white/80">
            Each match&apos;s win is worth more or less depending on how the
            two teams compared. We average each team&apos;s self-ratings and
            look at the gap. Beating a team rated higher than yours earns a{" "}
            <span className="text-pickle">bonus</span>. Beating a team rated
            lower earns a <span className="text-bright">discount</span>. The
            weight is capped between{" "}
            <span className="font-mono">0.5×</span> and{" "}
            <span className="font-mono">1.5×</span> so one match can&apos;t
            break a month.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            This is designed to close two gaps in a simple wins-based
            ranking:
          </p>
          <ul className="mt-2 space-y-1.5 pl-1 text-sm leading-relaxed text-white/80">
            <li>
              <span className="font-display text-pickle">Volume alone</span>{" "}
              won&apos;t carry you — the win-rate term means a 30–20 month
              earns about the same score as a 12–4 month.
            </li>
            <li>
              <span className="font-display text-pickle">
                Lower-rated opponents
              </span>{" "}
              won&apos;t carry you — those wins are discounted, so beating
              up on 3.0s when you&apos;re a 4.0 quietly counts less.
            </li>
            <li>
              <span className="font-display text-pickle">
                Doubles is a team game
              </span>{" "}
              — both partners get the same multiplier, based on team-average
              vs. team-average.
            </li>
          </ul>

          <p className="mt-5 font-display text-display-xs uppercase font-bold tracking-widest text-pickle">
            Worked examples
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <ExampleCard
              tone="even"
              label="Even matchup"
              line1="Two 3.5s beat two 3.5s, 11–9"
              line2="Team avg 3.5 vs 3.5 → gap 0"
              value="1.00"
            />
            <ExampleCard
              tone="discount"
              label="Discounted"
              line1="Two 4.0s beat two 3.5s, 11–7"
              line2="Team avg 4.0 vs 3.5 → gap −0.5"
              value="0.85"
            />
            <ExampleCard
              tone="discount"
              label="Discounted"
              line1="Two 4.0s beat two 3.0s, 11–4"
              line2="Team avg 4.0 vs 3.0 → gap −1.0"
              value="0.70"
            />
            <ExampleCard
              tone="bonus"
              label="Bonus (upset)"
              line1="A 3.0 + 3.5 team beats a 4.0 + 4.5 team, 11–9"
              line2="Team avg 3.25 vs 4.25 → gap +1.0"
              value="1.30"
            />
          </div>

          <p className="mt-4 text-xs leading-relaxed text-white/50">
            Only <span className="text-pickle">vouched</span> matches count.
            Guests don&apos;t appear on the ladder until they claim their
            account. Score margins (11–7 vs. 11–9) don&apos;t change a
            match&apos;s weight — only the rating gap does. Unrated players
            default to 3.5 for these calculations. Ties broken by weighted
            wins, then total wins, then matches played.
          </p>
        </section>

        {/* CTA */}
        <section className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/ladder"
            className="rounded-lg bg-pickle px-5 py-3 font-display text-display-xs font-bold uppercase tracking-wide text-black hover:opacity-90"
          >
            View ladders →
          </Link>
          <Link
            href="/rally/new"
            className="rounded-lg border-2 border-pickle px-5 py-3 font-display text-display-xs font-bold uppercase tracking-wide text-pickle hover:bg-pickle hover:text-black"
          >
            Log a rally
          </Link>
        </section>
      </div>
    </main>
  );
}

function Step({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border-2 border-pickle/40 bg-white/[0.02] p-4">
      <p className="font-display text-display-2xl font-extrabold leading-none text-pickle">
        {number}
      </p>
      <p className="mt-1 font-display text-display-md font-extrabold uppercase tracking-tight text-bright">
        {title}
      </p>
      <p className="mt-2 text-sm text-white/70 leading-relaxed">{body}</p>
    </div>
  );
}

function ExampleCard({
  tone,
  label,
  line1,
  line2,
  value,
}: {
  tone: "even" | "discount" | "bonus";
  label: string;
  line1: string;
  line2: string;
  value: string;
}) {
  const styles = {
    even: { border: "border-white/25", bg: "bg-black/40", text: "text-white/60", val: "text-white" },
    discount: { border: "border-bright/40", bg: "bg-bright/5", text: "text-bright", val: "text-bright" },
    bonus: { border: "border-pickle", bg: "bg-pickle/10", text: "text-pickle", val: "text-pickle" },
  }[tone];
  return (
    <div className={`rounded-xl border-2 p-3 ${styles.border} ${styles.bg}`}>
      <p
        className={`font-display text-[10px] uppercase font-bold tracking-widest ${styles.text}`}
      >
        {label}
      </p>
      <p className="mt-1 text-sm leading-snug text-white">{line1}</p>
      <p className="mt-1 font-mono text-xs text-white/60">{line2}</p>
      <p className="mt-2 font-mono text-xs text-white/50">
        win counts as{" "}
        <span className={`text-base font-bold ${styles.val}`}>{value}</span>
      </p>
    </div>
  );
}
