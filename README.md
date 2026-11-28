<p align="center"><b>Language</b>: English · <a href="./README.zh-CN.md">中文</a></p>

<p align="center">
  <img src="assets/banner.png" alt="yotta-memory banner" width="100%" />
</p>

<h1 align="center">元忆 (Yuanyi / yotta-memory)</h1>

<p align="center"><b>The next-generation memory engine whose data never leaves your machine.</b></p>
<p align="center">File-based memory for AI agents: recall context at the start of work, remember what matters as you go, archive at wrap-up. Plain Markdown you can read, diff and roll back — no cloud, no account, no telemetry, no daemon, no database.</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue" /></a>
  <a href="https://agentskills.io/"><img alt="Standard: agentskills.io" src="https://img.shields.io/badge/standard-agentskills.io-orange" /></a>
  <a href="https://www.npmjs.com/package/@yottameta/yotta-memory"><img alt="npm package" src="https://img.shields.io/npm/v/@yottameta/yotta-memory" /></a>
  <a href="https://github.com/YottaMeta/yotta-memory"><img alt="GitHub stars" src="https://img.shields.io/github/stars/YottaMeta/yotta-memory" /></a>
  <a href="https://github.com/YottaMeta/yotta-memory/commits/main"><img alt="last commit" src="https://img.shields.io/github/last-commit/YottaMeta/yotta-memory" /></a>
</p>

## Why agents forget — and what changes here

**1. Stop re-explaining the project every session.** The agent runs `yotta-memory context` and gets one package: identity, long-term summaries, a zero-inference profile, a recent corridor, boundaries, commitments and a session contract.

**2. Remember a decision the moment it is made.** `yotta-memory remember PREF "code style" "prefers short functions" --verify` writes it, reads it back, and keeps it in that agent's private zone.

**3. Wrap up without hand-carrying state.** Write a COMMIT anchor before the session ends; `maintain` / `consolidate` keep the store small over time; `context --audit` checks whether anything important was lost when the host compacted the conversation.

## What you get

- **Memory is files** — Markdown + YAML frontmatter in your own directory. Any editor can read it; git versions it; copying the folder moves the memory.
- **Four types, two levels** — FACT is public and shared; PREF / BOUND / COMMIT are private per agent. User-level `~/.yottamemory/` is shared across projects; project-level `.yottamemory/` travels with the repo.
- **Permissions by mechanism** — private files are AES-256-GCM envelope-encrypted (passphrase-derived master key + per-agent owner key + offline recovery key). An agent without its `agent_key` cannot decrypt them; the owner ID alone is not a credential.
- **Grows with use** — semantic recall (synonyms, pinyin, field weighting, fuzzy match, optional local embedding plugin), explicit `feedback` that adjusts weight, and `explain` for every score.
- **Never bloats** — unified utility score with per-type decay, near-duplicate merge, and `consolidate` summaries that carry provenance; originals are archived and `--undo` restores them.
- **Recoverable** — overwrite-protected `init`, trash-based `forget`, independent-volume backups with verification and restore drills, transaction snapshots before destructive writes, `doctor` health checks, and `scan` for prompt injection / leaks in the store.
- **Shareable across machines** — put the store on any host or disk; local CLI connects directly, other machines join over LAN MCP (see `references/lan-mode.md`).

### Memory types

| Type | Meaning | Visibility |
|---|---|---|
| `FACT` | facts / knowledge / experience | public zone, readable by all agents |
| `PREF` | preferences / habits | private zone, owning agent only |
| `BOUND` | boundaries / rules / bottom lines | private zone, owning agent only |
| `COMMIT` | commitments / anchors | private zone, owning agent only |

## Privacy in one page

- Public `FACT` is plaintext and auditable; `PREF` / `BOUND` / `COMMIT` are encrypted and split per owner.
- `yotta-memory view` unlocks with your passphrase and shows / exports **all** memory — you are the data owner.
- The engine makes no network calls. The only network access is what you run yourself (`npm i`) or a local provider subprocess you explicitly configure.
- The boundary is honest: this protects data at rest and isolates agents from each other. It does **not** claim to defend against a malicious process running as the same OS user.
- Full details: [`references/trust-card.md`](references/trust-card.md).

New stores are encrypted by default. To convert an existing plaintext store, run the interactive migration (non-ASCII passphrases must be typed at the prompt, not piped through a shell):

```bash
yotta-memory migrate --recovery-key-out "<recovery-key-file>"
```

Then authorize the agent in `yotta-memory view` (or `key bind`), let the agent `key claim`, and run `reindex` with `--agent-key-file`.

## Install

Yuanyi ships as a **CLI + skill** pair: `yotta-memory` reads and writes the store, and the skill teaches the agent the workflow. Pick one of four methods; skill files come from npm (GitHub can be slow without a proxy).

### Method 1: npm one-liner (recommended)

```text
# Optional China mirror: npm config set registry https://registry.npmmirror.com
npx -y --package @yottameta/yotta-memory yotta-memory-install --agent <agent-name>
npx -y --package @yottameta/yotta-memory yotta-memory-install --dir <your-skills-dir>
```

- `--agent <name>` installs to that agent's default user-level directory; `--list` shows the presets.
- `--dir <path>` installs to any skills directory, including agents not in the preset list.
- If the mirror has not synced a new package (404), add `--registry=https://registry.npmjs.org/` or wait for the cache.
- To read and write memories, also install the CLI: `npm install -g @yottameta/yotta-memory`.

### Method 2: git clone (developers / git available)

```text
git clone https://github.com/YottaMeta/yotta-memory.git <your-skills-dir>/yotta-memory
```

### Method 3: GitHub Download ZIP (manual / no git)

On `YottaMeta/yotta-memory`, click **Code → Download ZIP**, unzip it and put the `yotta-memory` folder into the agent's skills directory.

### Method 4: install.sh (multi-agent one-liner)

```text
bash install.sh --agent <name>   # default user-level directory
bash install.sh --dir <path>     # explicit directory
bash install.sh --list           # list agents -> default directories
```

### Two commands, two jobs

- `yotta-memory` — the engine CLI. `npx -y @yottameta/yotta-memory` only runs the engine temporarily; it does not install the skill.
- `yotta-memory-install` — the skill installer. It refuses symlinked targets (including Windows junctions) instead of writing through them.

## Quick start

```bash
yotta-memory init                  # new stores are encrypted by default
yotta-memory config get            # confirm where the store lives
yotta-memory context               # start-of-work package
yotta-memory remember FACT "project" "uses npm workspaces" --verify
yotta-memory recall "workspaces"
```

Typical output (illustrative):

```text
Recorded: ~/.yottamemory/facts/2026-11-28-0001.md
[verify] read-back OK: facts/2026-11-28-0001.md

# Start-of-work context (yotta-memory context)
## 1. Identity
## 2. User profile summary
## 3. Long-term understanding summaries
## 4. Recent corridor (time-ordered)
## 5. Recent high-value backfill
## 6. Boundaries (BOUND)
## 7. Commitments / anchors (COMMIT)
## 8. Session loop contract
```

### Command map

| Task | Command |
|---|---|
| Start of work | `context [--focus <keyword>] [--budget N]` |
| Write / read | `remember <type> <subject> <statement> --verify` · `recall <keyword>` |
| Housekeeping | `maintain [--apply]` · `consolidate [--apply]` · `archive --dry-run` |
| Health | `doctor` · `backup create / doctor / drill` · `scan` |
| Identity | `iam <id>` · `whoami` · `key claim <id>` |
| Sharing | `serve --stdio --tools core` · `lan enable` · `token new --agent <id>` |
| Review | `view` (local web platform) |

Full option list: [`references/cli-reference.md`](references/cli-reference.md). Per-command help: `yotta-memory <command> --help`.

## Upgrade

```bash
npm i -g @yottameta/yotta-memory        # upgrade the engine
npx -y --package @yottameta/yotta-memory yotta-memory-install --agent <agent-name>   # refresh the skill
```

After upgrading, check that `yotta-memory --version` and the installed `SKILL.md` `version:` agree.

## LAN multi-machine sharing

The store can live on a desktop, a NAS or an external disk. Local agents use the CLI; other machines connect over MCP with a per-agent token and agent key. Setup, autostart and recovery steps: [`references/lan-mode.md`](references/lan-mode.md).

> Transport boundary: the MCP endpoint is plain HTTP by default, so the bearer token and agent key travel in clear text on the wire. Use it only on a trusted LAN, VPN or SSH tunnel; add a TLS reverse proxy for anything beyond that.

## Docs

| Document | What is inside |
|---|---|
| [`USER_GUIDE.md`](USER_GUIDE.md) | task-oriented user manual (install → daily use → LAN → troubleshooting) |
| [`references/trust-card.md`](references/trust-card.md) | where data lives, who can read it, how to delete, backup and failure playbook |
| [`references/cli-reference.md`](references/cli-reference.md) | full command table, first boot, plaintext → encrypted migration |
| [`references/lan-mode.md`](references/lan-mode.md) | portable memory disk / LAN mode in full |
| [`references/faq.md`](references/faq.md) | common questions and pitfalls |
| [`references/protocol.md`](references/protocol.md) | storage layout, index, encryption format, type rules |
| [`CHANGELOG.md`](CHANGELOG.md) | what changed in every release |

## Development & validation

```bash
npm test                 # node --test
node --test --test-concurrency=2   # on unstable hardware
```

Release gates (run from the YottaSkills workspace): `python tools/validate-skill.py yotta-memory`, `python tools/preflight-publish.py yotta-memory`, `python tools/check_delivery_integrity.py`.

## License

MIT — see [LICENSE](LICENSE).
