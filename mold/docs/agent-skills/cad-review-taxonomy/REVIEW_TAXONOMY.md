# CAD Review Taxonomy (Shared)

This is the **one shared copy** of the review-depth rule and four-category
output taxonomy used by `.claude/skills/mold-cad-engineering/SKILL.md` and
`.claude/skills/mold-interactive-cad-ux/SKILL.md`. Both are peers that point
to this file only — neither restates its content, and neither owns it more
than the other. If this file and either Skill's own text ever disagree, this
file is authoritative. This mirrors the pointer/canonical pattern already
used by `docs/agent-skills/interconnected-systems-stability/SKILL.md`,
adapted for two peer Skills sharing one reference rather than one pointer
deferring to one canonical source.

This file does **not** define either Skill's own review checklist fields
(the field list in "Engineering Review Output" / "Interactive Review
Output") — those stay domain-specific in each Skill's own `SKILL.md`. It
defines only: how much review depth a task's risk level warrants, and the
four categories findings get classified into once the checklist is filled
in.

## Scale Review Depth to Risk

Per `docs/agent/ENGINEERING_LOOP.md`'s risk levels: a LOW-risk task needs
only the invoking Skill's own review-output checklist filled in briefly; a
STANDARD or HIGH-risk task warrants working through that Skill's relevant
sections before implementing. Do not produce an exhaustive section-by-section
review for a narrow, low-risk change just because the Skill was invoked —
that produces churn and token cost, not additional correctness.

## Output Taxonomy

Once the invoking Skill's own checklist is filled in, classify every finding
into exactly one of these four categories — shared precisely so
`mold-cad-engineering` and `mold-interactive-cad-ux` findings can be merged
into one review without a format mismatch:

- **Blockers** — the change is not valid as written and must be fixed before
  proceeding. What a Blocker looks like is domain-specific — see the
  invoking Skill's own "Assumptions This Skill Exists to Challenge" and
  Gotchas sections for concrete examples in its domain.
- **Risks** — plausible but unconfirmed defect sources.
- **Recommendations** — concrete, non-blocking improvements.
- **Optional enhancements** — out of scope for this change but worth noting
  for later.

Close every review with one **Recommendation** line. Keep the whole output
brief for a LOW-risk task — a filled checklist and a one-line verdict can be
enough; do not pad it with restated Skill content.

## When a Change Touches Both Domains

If a reviewed change is evaluated by both Skills, report each Skill's
findings separately using this same taxonomy rather than merging them into
one undifferentiated list — a change can be a geometric Blocker and an
interaction Risk at the same time, and collapsing that distinction hides
which reviewer is asserting what.
