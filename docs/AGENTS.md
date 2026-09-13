# The two agents

Both live in `.claude/agents/` and both work on the same `rebuild-state.json` in your
Drive that the web app reads. Nothing is copied or synced — it is literally the same file,
which is why a price the agent found shows up on your phone a second later.

---

## parts-scout — cross-references prices across your vendors

**Ask for it like this:**

> price the IMS bearing and the water pump
> run the price queue
> is the LN Nickies set worth it over new OE cylinders
> what would the whole gasket job cost me right now

**What it does:** reads the parts you marked **Researching** in the app, resolves the
correct part number from the genuine catalog first, then opens your logged-in Chrome and
checks FCP Euro, SSF, Worldpac, Rusnak Porsche, RockAuto and LN Engineering. It writes
every quote into the Prices tab with the brand, SKU, stock and a link.

**What it will not do:** buy anything, enter payment details, guess a price it couldn't
see, or recommend the cheapest line without saying what the tradeoff is. On an M96 the
cheap water pump is the expensive one, and it's told to say so.

**The queue:** mark a part **Researching** on the Parts tab and it goes into the agent's
list. That's the whole mechanism — no separate config.

---

## build-content — writes the posts

**Ask for it like this:**

> write up this week
> make an IG post about the bore scoring
> draft a reel for the case split
> catch the build log up

**What it does:** reads your log entries and photos from the last week (or whatever range
you name), picks the strongest shots — your ★ hero picks first — and drafts Instagram
captions with hashtags, reel scripts with timed beats, and long-form build-log posts. They
land in the Content tab as drafts for you to edit and approve.

**What it will not do:** invent a measurement, write a post about a step that isn't
finished, or pad three drafts out of a week where you logged one thing. If the log is thin
it says so and tells you what to shoot next time.

**Getting better output:** the drafts are only as good as the log. A log entry that says
"worked on heads" produces a generic post. One that says "valve guides measured .004 over
on 3 of 6, sending them to the machine shop, $840" produces a post someone actually reads.

---

## Running them on a schedule

Ask Claude to set up a scheduled task — for example a Sunday evening run that checks the
price queue and drafts the week's content, so both are waiting for you Monday morning.

---

## Under the hood

The state file is edited from two places at once — your phone and the agents. Blind
overwrites lose whoever wrote last, so both agents go through `scripts/state.mjs`:

```bash
node scripts/state.mjs summary ./state.json        # what's in there
node scripts/state.mjs queue   ./state.json        # parts awaiting pricing
node scripts/state.mjs session ./state.json 7      # last week's log, readable
node scripts/state.mjs merge   ./state.json ./patch.json ./out.json
```

`merge` is additive and id-aware — quotes and drafts append, step and part states merge per
key, nothing is ever deleted — and it validates before writing, so a malformed quote fails
loudly instead of corrupting the file your phone is about to open.

The agents re-download the state immediately before merging, so an edit you made in the
garage five minutes ago isn't clobbered by a price run.
