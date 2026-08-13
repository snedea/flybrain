# LinkedIn post: flybrain.app

Status: v3, Silviu's own edit, final for posting 2026-08-13.

---

So yesterday I gave a fly a job.

In 2024, researchers mapped every neuron in a fruit fly's brain, all
139,255 of them. That brain now runs live in your browser at
flybrain.app. Yeah, computers have come a long way.

The fly cannot type, so I gave it an agent named Buzz. Buzz is an
ambient agent: nobody prompts it, it listens for signals and files.
It reads the fly's neural state and files Workday requests on its
behalf: hunger becomes a meal voucher, fatigue becomes a PTO request,
a fright becomes a safety concern. Claude reviews each one as the fly's HR Partner, and
approvals have real consequences: an approved voucher drops food right
in front of the fly. The public demo simulates the Workday calls which,
thanks to the Workday tooling, could easily work on a WD tenant.

Here is why I built it on Workday. Most of what employees need never
gets typed into a form. It shows up as signals in the systems around
them: time entries that stop showing up, project dates that quietly
slip, invoice approvals sitting for two weeks, and weekend logins
creeping in. If an agent can turn a fly's behavior into clean Workday
transactions with an approval step in the loop, then the same pattern
can read the signals your people are already giving off. The fly is
the proof of concept. The APIs, the Agent Gateway, and the ambient
agent are not. Those are real today, waiting for better signals than
a hungry fly.

Watch the fly work: flybrain.app

---

## Edit notes (veto anything)

- "Yea" corrected to "Yeah," (the interjection; "yea" is the archaic
  vote-yes). Comma added after it.
- Collapsed a double space in "runs live in your browser".
- Everything else is untouched -- your additions read like you and
  they land ("could easily work on a WD tenant" carries the claim at
  exactly the right confidence).

---

## Marketing brief (response to the review questions)

### What I'm seeking to achieve

Show, not tell, that there has never been a better time to be a
Workday developer. A real fruit fly brain runs live in the browser; an
ambient agent named Buzz reads its state and files genuine Workday
requests; a reviewer approves or denies each one. Playful surface,
serious pattern: agents acting on signals instead of forms, with
governance in the loop. Built in a day on Workday's new agentic
tooling, under Kainos Workday AI CoE branding.

### Intended audience

The same audience as my article series: Workday decision makers (the
pattern is governable) and Workday developers (the tooling is
reachable).

### Call to action

Visit flybrain.app, read the article series for the how, and talk to
the Kainos Workday AI CoE about what an ambient agent could read off
the systems you already have.

### Disclosures

The public demo simulates the Workday calls (the post says so); the
same code runs against a real tenant. The Workday logo marks the
integration surface, as in any partner demo.
