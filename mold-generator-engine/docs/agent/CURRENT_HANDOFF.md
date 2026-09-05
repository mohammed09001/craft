# CURRENT_HANDOFF

## Current Objective

Built, then hardened, a Proposal-Driven Engineering Workflow on top of the
existing Loop Engine: User Request → Repository Investigation → Engineering
Proposal → Human Approval Gate → Approved Proposal → Loop Engine →
Execution Engine → Validation, with execution engines (Claude Code, Codex,
Gemini CLI, future engines) treated as pluggable and vendor-neutral. Full
design and current status: `docs/cad-skills/PROPOSAL_WORKFLOW.md` (its
status banner is the authoritative up-to-date state — do not trust a
claim restated elsewhere without checking it first). This was executed as
five user-confirmed phases, followed by an independent audit, followed by
an Engineering Hardening pass that closed every defect the audit found.
**All of it is now complete.**

**What's actually true right now**, verified directly (not restated from
earlier claims): `route()` creates a proposal immediately
(`DISCOVERING`→`ANALYZING`); `logCompiler()` advances it through
`COMPILING_PROPOSAL` and completes it directly into `AWAITING_APPROVAL`
from Prompt Compiler's validated output (or `CANCELLED`, mechanically, on
failure); `propose`/`approve`/`revise`/`reject`/`cancel`/`execute`/
`begin-validation`/`complete-validation` all exist and were exercised
against the real CLI, not just unit tests — including driving the exact
`EXECUTING`-forever trace an earlier audit flagged as a dead end all the
way to `COMPLETED`. Approval integrity now includes `approvedVersion` in
addition to the prompt hash and repository revision. A git `pre-commit`
hook (`.claude/loop/git-hooks/pre-commit`, installed at
`.git/hooks/pre-commit` via `node .claude/loop/loop-trace.mjs
install-git-hook`) blocks a commit whenever the most-recently-created
trace's proposal is `AWAITING_APPROVAL` — **this was verified end-to-end**
by invoking the installed script exactly as git would. The
Claude-Code-specific `PreToolUse` hook from the prior phase is unchanged
and still blocks `Edit`/`Write`/`NotebookEdit` under the same condition.
`node --test .claude/loop/loop-trace.test.mjs` is at **72/72** passing;
`python docs/cad-skills/tests/test_cad_skills.py` is at **12/12**.

**Important disclosed gaps, still open (by design or by real constraint,
not oversight):**
- The `PreToolUse` hook's live blocking behavior against Claude Code's
  actual harness remains unverified — only its script has been invoked
  directly with simulated payloads. (The git pre-commit hook does not
  share this gap — see above.)
- `git commit --no-verify` bypasses the pre-commit gate entirely; this is
  the standard escape hatch for any local git hook, disclosed rather than
  hidden.
- A Bash-performed file write that is never committed is still not
  intercepted by anything except the less-verified `PreToolUse` hook.
- `revise` still does not refresh `filesInvestigated`/etc. from a new
  compiler run (unchanged from an earlier phase; out of this Hardening
  pass's specific scope).

See `docs/cad-skills/PROPOSAL_WORKFLOW.md`'s Known Limitations for the
complete, current list.

Scope for this objective was strictly `.claude/`, Loop Engine
configuration, Skill contracts, orchestration scripts, diagnostic tests,
and `docs/cad-skills/` — no application/product code was touched. One
exception worth flagging explicitly: `install-git-hook` wrote a real file
to `.git/hooks/pre-commit`, which is local git configuration outside
version control — not a tracked repository file, but a real local-state
change nonetheless. It is easily reversible (`rm .git/hooks/pre-commit`).

### Prior objective (completed, committed)

Diagnosing and repairing this repository's Loop Engine / Skill
orchestration after a prior task reported zero Skills invoked despite
being asked to use it. Scope for that objective was strictly
`.claude/`, Loop Engine configuration, Skill contracts, orchestration
scripts, diagnostic tests, and `docs/cad-skills/` — no application/product
code was touched under that objective.

## Current Repository State

- Branch: `feature/professional-eraser-redesign`.
- HEAD: `3a39e83` ("Build complete CAD skills engineering framework"),
  which added the 7 `cad-*` Skills alongside `docs/cad-skills/` (registry,
  JSON schemas, examples, a schema-only Python test suite).
- `.claude/skills/` contains the five `mold-*` Skills, the seven `cad-*`
  Skills, and the `loop-engine` entry point. Do not assume a fixed count —
  verify with `Glob .claude/skills/**/SKILL.md` or `.claude/loop/registry.json`.
- A pre-existing, unrelated application-code diff is present in the
  working tree (registration/split-face/sprue-generation/viewport files
  under `frontend/src/`) — **not part of this objective**, not created or
  reviewed by any session in this thread, and must not be touched or
  discarded. Verify its current state with `git status --short` before
  assuming anything about it.
- `docs/cad-skills/registry/skill-registry.json` and
  `docs/cad-skills/registry/skill-registry.schema.json` show as modified
  in `git status` — this predates the Proposal-Driven Workflow effort
  entirely; no session in this thread edited either file. Do not attribute
  that diff to this work.
- **Uncommitted right now:** everything from the original Loop Engine
  repair (`.claude/loop/`, the `loop-engine` Skill, the `PostToolUse`
  hook) plus the full Proposal-Driven Workflow build and its Hardening
  pass — `docs/cad-skills/contracts/proposal.schema.json`,
  `docs/cad-skills/registry/execution-engine-registry.schema.json` +
  `execution-engines.json`, `docs/cad-skills/PROPOSAL_WORKFLOW.md`,
  `.claude/skills/prompt-compiler/SKILL.md`'s Section 3, the restructured
  `.claude/skills/loop-engine/SKILL.md`, `.claude/loop/git-hooks/pre-commit`,
  a `PreToolUse` hook in `.claude/settings.json`, and updates to
  `docs/cad-skills/README.md`, `docs/cad-skills/LOOP_ENGINE.md`,
  `docs/agent/WORKFLOW_POLICY.md`, `CLAUDE.md`, and
  `docs/cad-skills/tests/test_cad_skills.py`. Full detail in each phase's
  and the Hardening pass's completion reports earlier in this thread (not
  duplicated here). Also, outside version control:
  `.git/hooks/pre-commit` was installed for real (see above).

## Resume Point

Nothing is blocked. To continue: review/commit this work (see Immediate
Next Step), or start a new task.

## Protected Work

- The pre-existing application-code diff described above must not be
  reverted, discarded, or folded into any commit this work produces.
- This work is a deliberate deliverable awaiting user review and must not
  be reverted or discarded.
- Committed history (`f605681`, `bcd841d`, `3a39e83`) is safe in Git
  history.

## Current Risks

- `.claude/loop/registry.json` and `docs/cad-skills/registry/skill-registry.json`
  are two intentionally separate registries (different capability
  taxonomies — see `docs/cad-skills/LOOP_ENGINE.md`); keep both in sync
  manually if a `cad-*` Skill's identity, path, or dependencies change.
- `.git/hooks/pre-commit` is now installed and active. Any future commit
  attempt while a proposal is genuinely `AWAITING_APPROVAL` will be
  blocked (exit 1) until that proposal is resolved
  (`approve`/`revise`/`reject`/`cancel`), or bypassed explicitly with
  `git commit --no-verify`.

## Validation State

`node --test .claude/loop/loop-trace.test.mjs`: **72/72 passing.**
`python docs/cad-skills/tests/test_cad_skills.py`: **12/12 passing.**
Both were re-run fresh as part of an independent audit and again after the
Hardening pass — not merely restated from an earlier claim. Real CLI
smoke tests (not just unit tests) covered: the full lifecycle end-to-end
on a fresh proposal (`ANALYZING → ... → COMPLETED`), the mechanical
compiler-failure path (→ `CANCELLED`, never `REJECTED`), the previously
audit-flagged stuck `EXECUTING` trace being driven to `COMPLETED`, the
commit gate blocking and then unblocking on real trace files, and the
installed git hook executing correctly when invoked exactly as git would.

### Product-code validation

Not applicable — no application-code change was made.

## Immediate Next Step

Review the hardened Proposal-Driven Workflow and decide whether to commit
it — nothing has been committed or pushed. If desired, close the one
remaining disclosed gap by attempting a real `Edit`/`Write` while a
genuine proposal is `AWAITING_APPROVAL`, to confirm the Claude-Code
`PreToolUse` hook actually blocks it in practice (the git pre-commit hook
equivalent has already been confirmed).

## Notes for the Next Agent

`CLAUDE.md` is Claude Code's bootstrap entry point. Follow the reading
order defined there: (1) `AGENTS.md`, (2) `docs/agent/PROJECT_MAP.md`, (3)
this file, (4) `docs/agent/ENGINEERING_LOOP.md`, (5)
`docs/agent/WORKFLOW_POLICY.md`. Do not commit or push without explicit
user authorization — see `AGENTS.md` Safety and Git Rules.

For Skill orchestration specifically, also read
`docs/cad-skills/LOOP_ENGINE.md` and `docs/cad-skills/PROPOSAL_WORKFLOW.md`
before assuming anything about how many Skills exist, how they're
invoked, or what the proposal lifecycle actually enforces — these files
intentionally do not restate details elsewhere so they can't go stale
here again.
