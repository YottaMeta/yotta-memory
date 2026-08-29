<!-- SECURITY_REVIEW:START -->
# Security Review — yotta-memory v0.8.5

| Property | Value |
|----------|-------|
| Package | `@yottameta/yotta-memory` |
| Version | 0.8.5 (security fix) |
| Reviewer | codex-subagent security-reviewer (知微/codex) |
| Reviewed | 2026-08-29 |
| Trigger | SkillHub security scan findings (command execution + arbitrary path read/write via MCP) |

## Security-Sensitive Changes

- `bin/yotta-memory.js` (only file changed in this release): command-injection prevention, path-traversal prevention, and MCP access-control hardening for `distill` / `export` / `import`.

## Files Reviewed

| File | Notes |
|------|-------|
| `bin/yotta-memory.js` | Entire file read; focus on `callTool`, `mcpTools`, `distillCore`, and the new security helper functions (`resolveWithinRoot` / `isWithinRoot` / `splitCommandArgv` / `distillModelAllowlist` / `runDistillModel`). |

## Vulnerability Summary (what was fixed)

| # | OWASP | Severity | Finding | Status |
|---|-------|----------|---------|--------|
| 1 | A03 Injection (Command) | CRITICAL | MCP `distill` accepted a remote `--model` string passed to `child_process.spawnSync` with `shell: true` on Windows -> arbitrary command execution on the engine host. | FIXED |
| 2 | A01 Broken Access Control | HIGH | MCP `export` / `import` accepted arbitrary `out` / `src` paths, allowing remote read/write outside the memory root, beyond the documented `remote can only read/write memory` boundary. | FIXED |
| 3 | A03 Injection (Command, residual) | HIGH | CLI `distill --model` still used a shell-enabled `spawnSync` on `model` string (local-host command injection). | FIXED |

## OWASP Top 10 Checklist

| # | Category | Status | Notes |
|---|----------|--------|-------|
| A01 | Broken Access Control | FIXED | MCP `export`/`import` path now validated via `resolveWithinRoot`; anything outside the memory root is rejected before any file I/O. MCP `distill` rejects `--model` outright. |
| A02 | Cryptographic Failures | PASS | No new crypto surfaces; existing AES-256-GCM envelope key handling unchanged. |
| A03 | Injection | FIXED | `runDistillModel` uses `spawnSync(argv[0], argv.slice(1), { shell: false, windowsHide: true })`; argv split by `splitCommandArgv` (no shell). `distillModelAllowlist` restricts executable base name when configured. MCP `distill` denies `--model` at the tool boundary. |
| A04 | Insecure Design | PASS | Remote surface hardened: remote/stdio share the same `callTool`, so the fix covers both. |
| A05 | Security Misconfiguration | PASS | `shell:false` forced; no default credentials; no stack traces exposed. |
| A06 | Vulnerable Components | PASS | Zero runtime dependencies (`dependencies: {}`), no third-party packages to audit. |
| A07 | Auth Failures | PASS | Auth model unchanged (Bearer + X-Agent-Id); no new auth logic in this diff. |
| A08 | Data Integrity / Deserialization | PASS | JSON parse via `JSON.parse` on import; import now restricted to memory-root files. |
| A09 | Logging Failures | NOTE | Security denials are returned as tool errors (visible to the caller); consider logging rejected attempts to a local audit file in a future release. |
| A10 | SSRF | N/A | No server-side outbound HTTP requests in this diff. |

## Command-Injection Surface Audit

All `child_process` call sites:

| Line | Call | shell | User-controlled? | Verdict |
|------|------|-------|------------------|---------|
| ~150 | `spawnSync` in `runDistillModel` (new) | `false` | `argv[0]` / args, base-name allowlisted, args split without shell | SAFE |
| ~2886 | `lanSpawn` (LAN feature) | inherited spawn opts (`shell` default false) | `YOTTA_LAN_*_BIN`/args are operator config, not MCP injectable | SAFE |
| ~3189 | `execFileSync('schtasks', ...)` | `false` | fixed argv; task name is a constant | SAFE |
| ~3223 | `execFileSync('schtasks', ['/delete'...])` | `false` | fixed argv | SAFE |
| ~3247 | `execFileSync('schtasks', ['/query'...])` | `false` | fixed argv | SAFE |

No `exec` / `execSync` / constructor-string shell invocation remains.

## Path-Traversal / Access-Control Audit

- `resolveWithinRoot(root, p)`: resolves absolute/relative input, requires result `=== root` or `root + sep` prefix; blocks `..` traversal and absolute outside paths. `abs === root` is deliberately allowed (default export path).
- All other `callTool` path building uses internal constants / index-driven references (`resolveMemoryFile`/`resolveMemoryTarget`) mapped to existing entries; no raw client-supplied path reaches `path.join(root, ...)`. `archive` / `reindex` / `maintain` / `profile` operate on library-internal directories only.

## Validation (automated)

```
node test/_baseline_repro.js          -> all 3 SkillHub detection points now false
node test/security-boundary.test.js  -> SECURITY_BOUNDARY_RESULTS: {"pass":6,"fail":0}
node --check bin/yotta-memory.js     -> SYNTAX OK
CLI distill --model <safe-cmd>       -> 四、模型提炼 section present + model stdout captured (real run through runDistillModel)
```

> Related fix: the CLI argument parser previously consumed `--model` / `--subject` / `--reason` / `--merge` but never wrote them to `opts`, making the CLI `distill --model` path dead code. This release also completes those mappings so the hardened `runDistillModel` path is actually reachable via the local CLI (still `shell:false` + allowlist).

## Dependency Audit

```
package.json dependencies = {} (zero dependency)
npm audit: n/a (no dependencies)
```

**Security Review Status:** ISSUES_FIXED
<!-- SECURITY_REVIEW:END -->

