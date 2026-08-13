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

This is a demonstration piece for one message: there has never been a
better time to be a Workday developer. Workday just shipped real
agentic tooling, Agents, the Agent Gateway, and agent-callable APIs,
and I wanted to show what that actually makes possible rather than
describe it. So I built something memorable: a real fruit fly brain
(139,255 mapped neurons, published in Nature) running live in the
browser, with an ambient agent named Buzz that reads the fly's state
and files genuine Workday requests on its behalf, and a reviewer that
approves or denies each one before anything happens. It is
deliberately playful on the surface, but the pattern underneath is the
serious part: agents that act on signals instead of forms, with
governance built into the loop. It was built in a day, which is itself
part of the message. It also puts the Kainos Workday AI CoE visibly at
the front of this tooling; the site carries our branding and
watermark.

### Intended audience

The same two groups my article series has been speaking to. Decision
makers, who should come away thinking "if this works for a fly's
behavior, it works for the signals in my organization, and the
approval step means it can be governed." And Workday developers, who
will recognize the actual APIs and the Agent Gateway in the demo and
realize how reachable this is.

### Call to action

Layered, and leaning on the articles. First: visit flybrain.app and
watch it work; the site explains itself. Second: the article series
carries the education for anyone who wants to understand how to build
this way, so the post and the site funnel curious readers there.
Third, for organizations: talk to the Kainos Workday AI CoE about what
an ambient agent could read off the systems they already have. The fly
is the hook, the articles are the depth, and the CoE is the door.

### Disclosure notes for marketing

- The public demo simulates the Workday calls end to end; the post
  says so in one sentence. Same code files real paperwork against a
  real tenant.
- The Workday logo on the site marks the integration surface, as in
  any partner demo.
