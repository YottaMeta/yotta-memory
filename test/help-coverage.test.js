'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const SOURCE = fs.readFileSync(CLI, 'utf8');
const memory = require(CLI);

const REQUIRED_COMMANDS = [
  'init', 'remember', 'recall', 'forget', 'archive', 'backup', 'doctor',
  'maintain', 'consolidate', 'distill', 'feedback', 'explain', 'reindex',
  'export', 'import', 'iam', 'whoami', 'profile', 'context', 'token',
  'migrate', 'view', 'reset-password', 'key', 'config', 'runtime', 'serve',
  'lan', 'bench', 'scan', 'identity', '--version',
];

const REQUIRED_SUBCOMMANDS = {
  backup: ['volumes', 'setup', 'status', 'ensure-daily', 'schedule', 'create', 'list', 'doctor', 'restore', 'drill'],
  token: ['new', 'list', 'revoke'],
  key: ['list', 'bind', 'rotate', 'authorize', 'claim', 'status', 'revoke'],
  config: ['set', 'get'],
  runtime: ['install', 'use', 'rollback', 'status', 'list'],
  lan: ['enable', 'disable', 'status'],
  identity: ['remove'],
};

const RISK_OPTIONS = ['--no-encrypt', '--unsafe', '--apply', '--force', '--purge', '--allow-same-volume', '--quarantine', '--restore', '--yes'];

function asNameSet(value) {
  if (value instanceof Set) return value;
  return new Set(Array.isArray(value) ? value : Object.keys(value || {}));
}

function flattenCommands(model) {
  const commands = [];
  for (const group of model || []) {
    for (const command of group.commands || []) commands.push(command);
  }
  return commands;
}

function collectHelpOptions(commands) {
  const options = new Map();
  for (const command of commands) {
    for (const option of command.options || []) {
      assert.ok(option.flag, 'help option must have a flag: ' + JSON.stringify(option));
      options.set(option.flag, option);
    }
    for (const sub of command.subcommands || []) {
      for (const option of sub.options || []) {
        assert.ok(option.flag, 'subcommand option must have a flag: ' + JSON.stringify(option));
        options.set(option.flag, option);
      }
    }
  }
  return options;
}

function mainBooleanLiterals() {
  const start = SOURCE.indexOf('async function main()');
  const end = SOURCE.indexOf('if (require.main === module)');
  assert.ok(start >= 0 && end > start, 'main() source range must be discoverable');
  const body = SOURCE.slice(start, end);
  const values = new Set();
  const re = /^    else if \(a === '(--[a-z-]+)'\)/gm;
  let match;
  while ((match = re.exec(body))) values.add(match[1]);
  return values;
}

function runHelp() {
  const result = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

test('HELP_MODEL is the single source for commands, subcommands and options', () => {
  assert.ok(Array.isArray(memory.HELP_MODEL), 'HELP_MODEL must be exported as an array');
  const commands = flattenCommands(memory.HELP_MODEL);
  const names = new Set(commands.map((command) => command.name));
  for (const required of REQUIRED_COMMANDS) {
    assert.ok(names.has(required), 'HELP_MODEL is missing command: ' + required);
  }

  let subcommandCount = 0;
  for (const command of commands) {
    const expected = REQUIRED_SUBCOMMANDS[command.name];
    if (!expected) continue;
    const actual = new Set((command.subcommands || []).map((sub) => sub.name));
    for (const name of expected) {
      assert.ok(actual.has(name), 'HELP_MODEL is missing subcommand: ' + command.name + ' ' + name);
      subcommandCount += 1;
    }
  }
  assert.strictEqual(subcommandCount, 31, 'all 31 parser subcommand paths must be represented');
});

test('registered parser options and HELP_MODEL stay bidirectionally consistent', () => {
  const commands = flattenCommands(memory.HELP_MODEL);
  const helpOptions = collectHelpOptions(commands);
  const parserOptions = new Set([
    ...asNameSet(memory.CLI_FLAG_OPTS),
    ...asNameSet(memory.CLI_VALUE_OPTS),
  ]);

  for (const flag of parserOptions) {
    assert.ok(helpOptions.has(flag), 'parser option has no Chinese help entry: ' + flag);
  }
  for (const flag of helpOptions.keys()) {
    assert.ok(parserOptions.has(flag), 'help option is not registered in the parser lists: ' + flag);
  }

  for (const flag of RISK_OPTIONS) {
    const option = helpOptions.get(flag);
    assert.ok(option, 'risk option missing from HELP_MODEL: ' + flag);
    assert.ok(option.caution && option.caution.trim(), 'risk option must carry a caution: ' + flag);
  }
});

test('main() boolean literals cannot drift away from CLI_FLAG_OPTS', () => {
  const registered = asNameSet(memory.CLI_FLAG_OPTS);
  for (const flag of mainBooleanLiterals()) {
    assert.ok(registered.has(flag), 'boolean option in main() is not registered: ' + flag);
  }
});

test('top-level help remains render-stable', () => {
  const stdout = runHelp();
  const digest = crypto.createHash('sha256').update(stdout).digest('hex');
  assert.strictEqual(
    digest,
    'e881a5baff1b9c258fb0b7be0f7daedadac9811e20e4c0c8a9410d3ce83c07cd',
    'top-level help changed; review every command/option line, then update the snapshot digest intentionally'
  );
});
