import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { main, parseArgs, extendedHelp } from '../src/cli.js';
import { CliError } from '../src/cli-error.js';
import { dropStubBins, makeStubBins, type StubBins } from './helpers.js';

const CANNED = join(__dirname, 'fixtures/canned');
const TARGET = join(__dirname, 'fixtures/scan-target');
const TMP = mkdtempSync(join(tmpdir(), 'q4ts-cli-'));

describe('parseArgs', () => {
  it('scan defaults', () => {
    const c = parseArgs(['scan']);
    expect(c).toMatchObject({ command: 'scan', positional: null, out: null, maxCrap: 30, dryThreshold: 0.82, lcov: [], useExistingCoverage: false });
  });

  it('serve defaults port 4174, no --defer-scan', () => {
    const c = parseArgs(['serve', '.']);
    expect(c).toMatchObject({ command: 'serve', positional: '.', port: 4174, noOpen: false, deferScan: false });
  });

  it('full flag set', () => {
    const c = parseArgs([
      'serve', '/tmp/tgt', '--port', '5000', '--no-open', '--defer-scan',
      '--max-crap', '10', '--dry-threshold', '0.7',
      '--coverage-command', 'npm test -- --coverage', '--use-existing-coverage',
      '--lcov', '/a/lcov.info', '--lcov', '/b/lcov.info',
      '--crap4ts-bin', '/bin/crap4ts', '--dry4ts-bin', '/bin/dry4ts', '--arch4ts-bin', '/bin/arch4ts',
    ]);
    expect(c).toMatchObject({
      positional: '/tmp/tgt', port: 5000, noOpen: true, deferScan: true,
      maxCrap: 10, dryThreshold: 0.7, coverageCommand: 'npm test -- --coverage',
      useExistingCoverage: true, lcov: ['/a/lcov.info', '/b/lcov.info'],
      bins: { crap4ts: '/bin/crap4ts', dry4ts: '/bin/dry4ts', arch4ts: '/bin/arch4ts' },
    });
  });

  it('scan requires --out', () => {
    expect(() => parseArgs(['scan', '.'])).toThrow(CliError);
  });

  it('rejects unknown flags and commands', () => {
    expect(() => parseArgs(['scan', '.', '--out', '/tmp/x', '--wat'])).toThrow(/unknown flag/i);
    expect(() => parseArgs(['bogus'])).toThrow(CliError);
  });

  it('--help and empty argv yield help', () => {
    expect(parseArgs(['--help']).command).toBe('help');
    expect(parseArgs([]).command).toBe('help');
  });
});

describe('extended option help', () => {
  it('returns detailed text for a known option topic', () => {
    const text = extendedHelp(['--help', 'max-crap']);
    expect(text).toBeTruthy();
    expect(text!).toMatch(/CRAP/);
    expect(text!.length).toBeGreaterThan(80);
  });

  it('falls back to null for unknown topics and plain --help', () => {
    expect(extendedHelp(['--help', 'nope'])).toBeNull();
    expect(extendedHelp(['--help'])).toBeNull();
    expect(extendedHelp([])).toBeNull();
  });

  it('finds the topic also after a subcommand', () => {
    expect(extendedHelp(['serve', '.', '--help', 'port'])).toMatch(/port/i);
  });

  it('main prints the extended text and exits 0', async () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    try {
      expect(await main(['--help', 'dry-threshold'])).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(writes.join('')).toMatch(/similarity|duplicat/i);
  });
});

describe('main (headless scan with stub bins)', () => {
  const stubs = makeStubBins(CANNED);
  afterAll(() => dropStubBins(stubs));

  it('writes the merged dataset and exits 0', async () => {
    const out = join(TMP, 'report.json');
    const exit = await main([
      'scan', TARGET, '--out', out,
      '--crap4ts-bin', stubs.crap4ts, '--dry4ts-bin', stubs.dry4ts, '--arch4ts-bin', stubs.arch4ts,
    ]);
    expect(exit).toBe(0);
    const parsed = JSON.parse(readFileSync(out, 'utf8'));
    expect(parsed.modules.length).toBe(3);
    expect(parsed.meta.thresholds).toEqual({ maxCrap: 30, dryThreshold: 0.82 });
  });

  it('help exits 0', async () => {
    expect(await main(['--help'])).toBe(0);
  });

  it('unknown command exits 1', async () => {
    expect(await main(['bogus'])).toBe(1);
  });
});
