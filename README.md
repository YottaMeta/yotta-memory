<p align="center"><b>Language</b>: English · <a href="./README.zh-CN.md">中文</a></p>

<p align="center">
  <img src="assets/banner.png" alt="yotta-memory banner" width="100%" />
</p>

<h1 align="center">元忆 (Yuanyi / yotta-memory)</h1>

<p align="center">Boundary-aware, file-based memory for AI agents: let any agent live across sessions instead of a single conversation.</p>
<p align="center">Start work with <code>recall</code> to restore context, <code>remember</code> important facts as you go, and archive at wrap-up; memories are Markdown files in the user's own directory — <b>readable, editable, auditable, rollback-able</b>, zero-dependency and ready to use.</p>
<p align="center">FACT is shared, PREF / BOUND / COMMIT are privately isolated — <b>who may read what is decided by mechanism, not by AI self-discipline</b>; one memory store can be shared across agents, travels with the disk, and can be shared over LAN.</p>
<p align="center">"Grows smarter the more you use it": <code>profile</code> aggregates a user profile (zero inference) + <code>context</code> builds a one-shot start-of-work package (identity + profile + recent memory + boundaries + commitments + wrap-up discipline), turning memory from "storage" into "a memory system that grows".</p>
<p align="center"><b>Mechanism-level encryption for the private zone</b>: AES-256-GCM envelope encryption + passphrase-derived master key + recovery key; <code>yotta-memory view</code> is a user-facing review platform (unlock with passphrase to see all AI memory); <code>migrate</code> converts plaintext → encrypted; <code>--no-encrypt</code> can downgrade. Cross-agent privacy upgrades from "discipline-level isolation" to "mechanism-level unreadable".</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue" /></a>
  <a href="https://agentskills.io/"><img alt="Standard: agentskills.io" src="https://img.shields.io/badge/standard-agentskills.io-orange" /></a>
  <a href="https://www.npmjs.com/package/@yottameta/yotta-memory"><img alt="npm package" src="https://img.shields.io/npm/v/@yottameta/yotta-memory" /></a>
  <a href="https://github.com/YottaMeta/yotta-memory"><img alt="GitHub stars" src="https://img.shields.io/github/stars/YottaMeta/yotta-memory" /></a>
  <a href="https://github.com/YottaMeta/yotta-memory/commits/main"><img alt="last commit" src="https://img.shields.io/github/last-commit/YottaMeta/yotta-memory" /></a>
  <a href="https://github.com/YottaMeta/yotta-memory"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen" /></a>
</p>

> 📖 The user-facing operations manual lives in [USER_GUIDE.md](USER_GUIDE.md).

> 🆕 **v0.8.3**: bilingual README alignment — README.md becomes the English facade (GitHub / npm / ClawHub homepage) and README.zh-CN.md carries the full Chinese doc; no functional changes.

## Core value

Most memory solutions treat "remembering" as a black box: data goes into a database or the cloud, where users can see it but cannot change or audit it, let alone control "which agent sees what". Yuanyi takes a different path — restoring memory to visible, manageable files (public FACT is plaintext and auditable; the private zone is mechanically encrypted and user-unlockable with a passphrase):

- **Memory is files** — each memory is a Markdown file with YAML frontmatter in the user's own directory. Any editor can view / edit / delete; git handles versioning and rollback; team sync and handoff use the same standard toolchain.
- **Isolation is guaranteed by mechanism** — FACT goes to the public zone and is shared; PREF / BOUND / COMMIT go to the private zone, physically split per owner (`private/<owner>/<type>/`). Reads are partitioned by scope/owner; out-of-bound content is intercepted by the CLI and never returned (silently skipped by default; explicit unauthorized cross-read is denied with an error); all reads/writes go through CLI / MCP — direct shell access to library files is forbidden. Permissions are enforced by mechanism, not by AI "self-discipline".
- **Zero dependency, ready to use** — no daemon, no database, no vector store; just Node.js. Install and use; data stays on the machine; deployable anywhere.
- **Grows smarter (v0.6.0)** — `profile` aggregates a user profile (the engine infers nothing; it only groups verbatim text) + `context` generates a one-shot start-of-work package (identity + profile + recent memory + boundaries + commitments); the SKILL "memory discipline" injects rule layers (type red lines / trigger signals / know the user / bottom lines / host isolation) — rules and mechanisms only, no personality data; zero data out of the box.
- **Self-learning / self-evolving / self-improving (v0.8.0)** — `recall` semantic search (synonyms / pinyin full + initials / field weighting / fuzzy match, zero-dependency) with utility-score blended ranking; `feedback` explicit usage feedback loop (useful / useless adjusts weight / confidence / feedback_net); `maintain` rule-layer self-organization (unified utility score + age-based auto-archive / forget candidates / dedup, dry-run by default, immutable / BOUND exempt); `distill` psychological-log distillation (statistical summary / topic profile / knowledge map, optional `--model` external model enhancement).
- **Private-zone encryption (v0.7.0)** — private files AES-256-GCM envelope encrypted (passphrase-derived master key + recovery key + per-owner encrypted index); `yotta-memory view` user review platform (unlock with passphrase to see all AI memory).

### Memory types

Memory is classified into four types; the type decides visibility:

| Type | Meaning | Visibility |
|---|---|---|
| `FACT` | facts / knowledge / experience (verifiable, shareable) | public zone, readable by all agents |
| `PREF` | preferences / habits / likes | private zone, readable only by the owning agent by default |
| `BOUND` | boundaries / rules / bottom lines | private zone, readable only by the owning agent by default |
| `COMMIT` | commitments / anchors / agreements | private zone, readable only by the owning agent by default |

- **Two-level storage**: user-level `~/.yottamemory/` shares personal memory across projects; project-level `.yottamemory/` travels with the project — natural for handoff and team collaboration. recall prefers project-level.
- **Same-key auto-update**: rewriting the same subject + statement only updates `updated`, no duplicates.
- **Rich metadata**: each memory carries `confidence`, `tags`, `immutable`, `created/updated`, `access_count` and more for retrieval and lifecycle management.

### Permissions & isolation

- **Three read states**: public FACT always readable; own private always readable; other agents' private is denied by default (content not returned).
- **Physically isolated directories**: private memory lives at `private/<owner>/<type>/`; different agents' private files are physically separated; legacy flat `prefs/` `bounds/` `commits/` auto-migrate on `reindex`.
- **Three authorization gates** (any one grants reading another's private): 1. explicit grant in `grants.json`; 2. identity=user (`--agent user` / `--owner user` / `YOTTA_AGENT_ID=user`); 3. explicit `--unsafe` (user explicitly authorized).
- **Silent by default, explicit cross-read errors**: default recall silently skips other agents' private (no "there are N invisible private entries" leak); only explicit cross-agent reads (`--all` / `--owner <other>`) without authorization error / warn.
- **`--agent <other>` does not cross**: it only declares identity for display; reading other agents' private still needs grant / identity=user / `--unsafe`.
- **Isolation positioning**: scope: private guarantees semantic isolation between AIs; since v0.7 the private zone is mechanism-level confidentiality — files are AES-256-GCM envelope encrypted, so an AI without the owner key cannot decrypt them even if it reads the ciphertext; data sovereignty remains with the user, who can use `yotta-memory view` to unlock and view / export any memory file.
- **No direct shell reads/writes**: all memory reads/writes go through CLI / MCP tools; directly reading or editing library files with shell commands bypasses scope/owner boundaries.

### Agent identity (unique ID + self profile)

Each agent has a globally unique agent ID: it is the ownership key for private memory (PREF / BOUND / COMMIT) and the identity declaration for remote access (`X-Agent-Id`).

- **Register (must be unique)**: `yotta-memory iam <id>` writes `agents.json` at the memory root, **enforcing uniqueness** — denied if the ID is already used by another host / source (including remote token registration); `--force` only when you confirm it is the same agent.
- **Confirm identity**: `yotta-memory whoami` (remote MCP tool `agent_info`) reads the "declared identity of this session" — it never guesses or assumes.
- **Self profile (forced to disk)**: `iam` auto-writes a PREF `subject=自我接入档案` (owner=self) with `; `-separated key:value: `agent_id / host / memory_home / mcp_mode / engine_url / token` (token not stored locally). Start work with `recall "自我接入档案"` to recover identity and connection info.
- **No token locally**: local CLI / stdio direct connection bypasses the network and does not validate tokens; identity is declared via the agent's MCP `env.YOTTA_AGENT_ID`.
- **Private memory requires an owner**: writing PREF / BOUND / COMMIT without declaring identity is rejected (public FACT is unaffected), mechanically preventing ID spoofing.

### Profile & start-of-work context (v0.6.0)

- **profile**: aggregates `private/<owner>/` PREF / BOUND / COMMIT verbatim, grouped by type + subject + tags, written to `profile.md`; the engine infers nothing — profile conclusions are formed internally by the AI per the "memory discipline", never pasted as labels.
- **context**: one-shot start-of-work package — multi-agent integration rules + identity + user profile digest + recent memory (importance-sorted) + boundary reminders + commitments/anchors; supports `--budget` character budget (constant tokens, does not grow with memory).
- **Memory discipline**: SKILL.md embeds a rule layer (type red lines / proactive trigger capture / know-the-user three stages / psychological grounding & alignment / bottom lines / host isolation / anti-patterns).

### Retrieval: semantic search (v0.8.0) + Chinese tokenization scoring

- `remember` auto-builds the `index.json` index (version 4 since v0.8.1 with field weighting and pinyin tokens; public indexes over 5000 entries shard by year `index-<year>.json`; old indexes rebuild on first recall); recall defaults to semantic search — exact (field weighting: subject×3 / tags×2 / statement×1) + synonyms (built-in wordlist, extensible) + pinyin (full / initials, built-in 3755 common characters) + fuzzy (edit distance ≤ 2) + substring fallback, blended with utility score (0.65 × semantic + 0.35 × utility), zero-dependency.
- `recall --explain`: shows each hit's reason (exact / synonym / pinyin / fuzzy + field) and utility components.
- **Candidate pre-filtering (v0.8.1)**: before semantic scoring, index tokens coarsely filter the candidate set (exact / synonym / pinyin / substring / fuzzy length gate) — hit set identical to v0.8.0; the `view` platform paginates by offset, fetching only the current page.
- Optional embedding plugin: protocol reserved (implemented in v0.9); without a plugin it degrades to zero-dependency automatically.
- The `tokens` field of `index.json` is a Chinese-tokenization term-frequency table (for TF scoring), **not** an access credential; auth tokens live at `.server/tokens.json`.
- Supports keywords, `--type` filter, `--limit` truncation, project-level priority.
- **Root de-duplication (v0.6.5)**: when project and user roots point at the same directory, recall / context uniquify roots so a file shows once.
- Hits accumulate `access_count` / `last_accessed` for lifecycle management.

### Lifecycle management (v0.8.0 rule-layer self-organization)

- `maintain`: unified utility score (final score = confidence + usage + recency + type + structure) × weight; low-utility + over-age auto-archive; extreme low value listed as forget candidates (not really deleted by default; `--purge` deletes); `--dedup` dedup candidates; `--merge A,B` manual merge. Dry-run preview by default, `--apply` to execute; immutable / BOUND exempt; audit writes `.archive/audit-<date>.jsonl`.
- `archive`: moves low-value old memory into `.archive/` by "unified utility score + age" (immutable excluded) so the store never grows without bound.
- `feedback`: explicit usage feedback loop — useful → weight ×1.2 (cap 3.0) + confidence +0.05 + feedback_net +1; useless → weight ×0.8 (floor 0.2) + confidence −0.05 + feedback_net −1; `--undo` rolls back; audit writes `.archive/feedback-<date>.jsonl`.
- `distill`: psychological-log distillation — statistical summary (type / age / heat / feedback) + topic profile (clustered by subject) + knowledge map (type → tags); optional `--model <cmd>` external model stdin→stdout refinement; output to `private/<owner>/distills/` or `facts/distills/`.
- `explain`: view a single memory's utility components and archive / forget status decision.
- `forget`: delete a single memory (by type-dir path or file name).
- `reindex`: rebuild the index after manually editing `.md` files.
- `export` / `import`: export the whole store to JSON / import from JSON; an intermediate format for migration and backup.
- git: the whole store can be version-controlled — rollback / audit / team sync.

## Comparison with other approaches

> Compared by solution type, not product names. Criteria: data sovereignty, deployment cost, permission boundaries, auditability, cross-agent ability.

| Dimension | Yuanyi (yotta-memory) | Database / embedded storage | Vector store / semantic retrieval | Cloud-hosted memory service |
|---|---|---|---|---|
| Storage form | Public FACT plaintext files; private zone encrypted (.md.enc); git-versionable | binary / structured database files | vector index + model dependency | vendor servers |
| Data sovereignty | fully local, readable/editable/deletable (private zone via view platform) | local, but needs dedicated tools | local or self-hosted; model extra | not in user's hands; TOS-bound |
| Permission boundaries | built-in: public/private zones + scope/owner + grants | usually none, DIY | usually none, DIY | account-level only, no memory-level granularity |
| Audit / rollback | public FACT plaintext auditable; private encrypted but user-decryptable via view; git rollback | needs export toolchain; complex rollback | snapshot/export dependent | platform export dependent |
| Deployment & deps | zero-dependency, runs on Node.js | needs database runtime / embedded dep | vector store + model, heavier | online + account, data leaves local |
| Cross-agent | Agent Skills standard; write once, multiple agents read | per-agent integration, no standard | per-agent integration, costly | platform coverage dependent |

**Conclusion**: Yuanyi's core differentiator is combining "data sovereignty + permission boundaries + zero dependency" — auditable files, mechanism-level read isolation, and no heavy dependencies. For "local-first, multi-agent collaboration, long-term accumulation", it is the lightest path.

## Install

Yuanyi ships as **CLI + skill** — the `yotta-memory` command reads/writes memory, and the skill teaches agents the workflow. Pick any method; skill files come from **npm**.

### Method 1: npx skills (recommended, ecosystem-standard entry)
```bash
npx skills add YottaMeta/yotta-memory
```
> Auto-installs the skill files into detected agents (Claude Code / Codex / Cursor / OpenCode and 78+ more). This installs only the skill instructions (SKILL.md etc.); to use the `yotta-memory` read/write commands you also need the CLI: `npm install -g @yottameta/yotta-memory` (see method 2).

### Method 2: npm direct install (CLI + skill)
```bash
# domestic mirror (optional): npm config set registry https://registry.npmmirror.com
npm install -g @yottameta/yotta-memory
yotta-memory init            # initialize the memory store
yotta-memory-install -g                  # install the skill into all recognized agents (user level)
yotta-memory-install --agent codex       # install into one specific agent
```

> After global install both `yotta-memory` (read/write) and `yotta-memory-install` (installer) are on PATH. Prefer not to install globally? Run the installer one-shot: `npx -y --package @yottameta/yotta-memory yotta-memory-install -g`.

### Method 3: install.sh / manual copy
After obtaining the skill folder (`npm pack` unpack or `git clone`), enter the folder:
```bash
bash install.sh -g                 # user level; bash install.sh --list shows all directories
bash install.sh --agent codex      # specific agent
bash install.sh --dir /path/to/skills
```
You can also copy the whole `yotta-memory` folder into the target agent's skills directory (common locations via install.sh --list).

## Upgrade

Two upgrade paths match the two install paths:

**Upgrade the CLI** (rerun the install command; no version tag defaults to latest):
```bash
npm i -g @yottameta/yotta-memory
```

**Upgrade the skill**: rerun the install command you used originally (`npx skills add YottaMeta/yotta-memory` or `yotta-memory-install -g`) to overwrite the old skill folder.

> Upgrades only affect commands and skill files — **they never touch your stored memories** (memory is independent of the install, kept in its own directory).

## CLI usage

| Command | What it does |
|---|---|
| `yotta-memory init [--project] [--dir <dir>]` | Initialize the store (default user-level `~/.yottamemory/`; --dir sets an explicit location) |
| `yotta-memory remember <type> <subject> <statement> [--owner <id>] [--source <src>] [--weight <0..>] [--verify] [--no-hint]` | Write a memory (same subject+statement auto-updates; --owner marks ownership; --source records origin; --weight importance, dedup takes max; --verify read-back; --no-hint disables type hints) |
| `yotta-memory recall [keywords] [--type T] [--limit N] [--agent <id>] [--owner <id>] [--all] [--unsafe]` | Search memory (index + TF scoring, partitioned reads; cross-reading other agents' private is denied by default, needs grant / identity=user / `--unsafe`; project-level priority) |
| `yotta-memory profile [--owner <id>]` | Generate a user profile (aggregates `private/<owner>` verbatim, zero inference, writes `profile.md`; cross-owner denied by default) |
| `yotta-memory context [--limit N] [--owner <id>] [--budget N]` | Generate the start-of-work package (identity + multi-agent rules + profile + recent memory + boundaries + commitments; --budget budgets recent-memory chars, constant tokens) |
| `yotta-memory forget <file>` | Delete a memory (by type-dir path or file name) |
| `yotta-memory archive [--days 180] [--threshold 0.4]` | Archive old memory (final score + age; immutable excluded) |
| `yotta-memory reindex` | Rebuild the index (after manually editing .md) |
| `yotta-memory export [--out f.json]` / `import <f.json>` | Export / import |
| `yotta-memory config set memory_home <dir>` / `config get` | Persist / view the store location (`~/.yottamemory/config.json`) |
| `yotta-memory whoami` | Show the current agent identity and registration status |
| `yotta-memory iam <id> [--name <name>] [--user <user>] [--relationship <rel>] [--force]` | Register this agent's unique identity and auto-write the self profile (`agents.json`, ID must be unique) |
| `yotta-memory token new --agent <id> [--force]` / `token list` / `token revoke --agent <id>` | Create / list / revoke access tokens for agents (registered at `.server/tokens.json`) |
| `yotta-memory serve [--host 0.0.0.0] [--port 8787] [--no-auth] [--stdio]` | Start the MCP memory engine (streamable HTTP LAN / --stdio local zero-process mode; Bearer token + X-Agent-Id auth) |
| `yotta-memory lan enable [--onstart] / disable / status` | Autostart management (Windows: scheduled task, default ONLOGON, --onstart needs admin, non-admin auto-degrades to user-level Startup; Linux: systemd user unit, falls back to user crontab @reboot) |

Types: `FACT` (fact, public shared) / `PREF` (preference) / `BOUND` (boundary) / `COMMIT` (commitment).

Example:
```bash
yotta-memory init
yotta-memory remember PREF 用户 偏好短回复，不要用表情
yotta-memory recall 偏好
yotta-memory profile
yotta-memory context --limit 10
yotta-memory recall --type FACT --limit 10
```

Environment variables:
- `YOTTA_MEMORY_HOME`: overrides the user-level store directory (default `~/.yottamemory/`).
- `YOTTA_AGENT_ID` / `AGENT_ID`: current agent ID (local identity declaration; participates in read-partition decisions; private memory requires an owner, undeclared is rejected).

## After the agent is wired up

Once the skill is installed into an agent, SKILL.md teaches it the workflow automatically: start work with `recall` to restore context → `remember` important info as you go → archive at wrap-up. You can also just say "记住 XXX" / "上次说到哪了" in conversation.

## LAN multi-machine sharing (portable memory disk mode)

The store can live on any host or disk (= the memory engine) and be reached by agents on other LAN hosts:

- **Local direct**: CLI reads/writes directly, no token;
- **Remote**: the engine host runs `yotta-memory serve` (or registers `lan enable` autostart); remote agents connect via MCP with `url + token`.
- **Local zero-process**: local MCP clients can use `serve --stdio` to launch the CLI on demand (no resident process).

### Engine side (the host where memory lives)

1. Initialize or attach to the store (see CLI usage).
2. Generate an independent token for each agent that needs access:
   ```bash
   yotta-memory token new --agent <agent-id>     # printed once, e.g. ytm_... (--force if the ID is taken by another source)
   yotta-memory token list                        # list registered agents
   yotta-memory token revoke --agent <agent-id>   # revoke
   ```
   > New tokens take effect immediately; no service restart needed.
3. Start the service (default listens on 0.0.0.0:8787, Bearer token + X-Agent-Id auth) — temporary run or register autostart:
   ```bash
   yotta-memory serve                          # temporary foreground
   yotta-memory lan enable                     # register autostart (Windows: scheduled task / user-level Startup; Linux: systemd user unit / user crontab)
   yotta-memory lan status                     # autostart status
   ```
   > `lan enable --onstart` switches to start-at-boot (needs admin); non-admin `lan enable` auto-degrades to user-level silent Startup; `lan disable` removes it.

> On first listen on 0.0.0.0, Windows / the system firewall may ask to allow it — allow it, or other LAN hosts cannot reach it; `--no-auth` disables auth for trusted intranets only.

### Client side (remote agent)

Register the connection in the agent's MCP config (`url` + two headers):

```json
{
  "mcpServers": {
    "yotta-memory": {
      "url": "http://<engine-host-ip>:8787/mcp",
      "headers": {
        "Authorization": "Bearer <TOKEN>",
        "X-Agent-Id": "<this-agent-id>"
      }
    }
  }
}
```

Once connected, MCP tools (remember / recall / search / forget / archive / reindex / export / import / agent_info) read/write memory and confirm identity; management actions (init / config / token / lan / serve) are not exposed via MCP, and token management is never exposed remotely. `X-Agent-Id` must match the token's registered agent; read-partition rules are the same as the CLI (FACT public-readable, PREF / BOUND / COMMIT private).

### Location persistence

The CLI persists the store location (`~/.yottamemory/config.json`), so agents on the same host use the right location on later `recall` without re-specifying:

```bash
yotta-memory config set memory_home <store-dir>
yotta-memory config get
```

Resolution priority: `YOTTA_MEMORY_HOME` (temporary override) > `config.json#memory_home` (persistent) > default `~/.yottamemory`. Put the store on a disk, plug it into any host, run `config set memory_home` once (or `yotta-memory init --dir <dir>` to initialize directly to a location) and all memory is restored on that host.

## Development & validation

- Run at the project root: python tools/validate-skill.py yotta-memory
- Engine self-test: node --check bin/yotta-memory.js; node bin/yotta-memory.js --version

Keep tests green and bump the version before releasing changes.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

[MIT](./LICENSE) © YottaMeta. "Yuanyi" / "yotta-memory" and the YottaMeta family names (yotta-* prefix) are YottaMeta brand identifiers; derived works must not reuse them, see [NOTICE](./NOTICE).
