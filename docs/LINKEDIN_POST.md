# LinkedIn post: flybrain.app

Status: draft for Silviu's edit pass, written 2026-08-12 for posting
2026-08-13. Written-register voice rules applied.

---

So yesterday I gave a fly a job.

Not a cartoon fly. In 2024, researchers mapped every neuron in a fruit
fly's brain, all 139,255 of them, and published the complete wiring
diagram in Nature. I think it is one of the most incredible things we
have ever built as a species. That brain now runs live in your browser
at flybrain.app. Nobody scripts it. It gets hungry, it gets tired, it
gets startled, and you can watch every one of those decisions fire
across the connectome in real time.

Here is the fun part. The fly cannot type and it cannot talk. Its only
language is behavior. So I gave it an agent named Buzz. Buzz reads the
fly's neural state, interprets the behavior as communication, and files
Workday requests on the fly's behalf. Hunger becomes a meal voucher
request through the Compensation API. Fatigue becomes a PTO request.
Curiosity becomes a career goal. A fright becomes a workplace safety
concern.

And then Claude plays the administrator. It reviews everything Buzz
files and approves it, or sometimes denies it. The approvals have real
consequences: an approved meal voucher drops food right in front of the
fly, and approved PTO dims the lights so it can actually rest. A denied
voucher means the fly stays hungry until Buzz can re-file. There is a
budget, after all.

To be clear about what is real: the public demo simulates the Workday
calls end to end, same requests, same shapes, no live tenant. Point the
same code at a real tenant and it files real paperwork.

I built this in a day with Claude Code, mostly by describing what I
wanted and correcting what I saw. The fly did the rest.

It is not a serious project. But watching a real brain take care of
itself through enterprise software keeps raising a question for me: if
an agent can turn a fly's behavior into paperwork, what could one read
off the systems you already have?

Watch the fly work: flybrain.app

---

## Notes for the edit pass

- The "It gets hungry, it gets tired, it gets startled" triple is
  repetition-as-emphasis; veto if it was not the rhythm you wanted.
- "There is a budget, after all." is a joke beat I added; easy cut.
- The honesty paragraph ("To be clear about what is real") is there so
  nobody at Workday reads an overclaim; reword freely but keep the
  disclosure.
- No hashtags included; add your usual set if you want them. Suggested
  minimal: #Workday #Agents #ClaudeCode
- Credit option if you want it: a line citing FlyWire/Dorkenwald et al.
  2024 and the worm-sim lineage, e.g. "Standing on the shoulders of the
  FlyWire Consortium and heyseth's worm-sim."
