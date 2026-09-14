import type { ArchitectureDump, DuplicatePair, FunctionFinding, ModuleRollup } from '../types.js';

export function buildModuleRollups(
  architecture: ArchitectureDump,
  functions: FunctionFinding[],
  pairs: DuplicatePair[],
): { modules: ModuleRollup[]; unattributed: { files: string[]; functionCount: number } } {
  const fileToModule = new Map<string, string>();
  for (const [module, file] of Object.entries(architecture.architecture.moduleToSourceFile)) {
    fileToModule.set(file, module);
  }
  for (const node of architecture.architecture.graph.nodes) {
    if (!fileToModule.has(node)) fileToModule.set(node, node);
  }

  const rolls = new Map<string, ModuleRollup>();
  const roll = (module: string): ModuleRollup => {
    let r = rolls.get(module);
    if (!r) {
      r = {
        module,
        sourceFiles: [],
        functionCount: 0,
        worstCrap: null,
        bands: { low: 0, moderate: 0, high: 0, unknown: 0 },
        dupePairs: 0,
        abstract: architecture.architecture.abstractModules.includes(module),
      };
      rolls.set(module, r);
    }
    return r;
  };
  for (const module of architecture.architecture.graph.nodes) roll(module);

  const unattributedFiles = new Set<string>();
  let unattributedCount = 0;

  const moduleOf = (file: string): string | null => fileToModule.get(file) ?? null;

  for (const f of functions) {
    const module = moduleOf(f.file);
    if (module === null) {
      unattributedFiles.add(f.file);
      unattributedCount += 1;
      continue;
    }
    const r = roll(module);
    if (!r.sourceFiles.includes(f.file)) r.sourceFiles.push(f.file);
    r.functionCount += 1;
    r.bands[f.risk] += 1;
    if (f.crap !== null && (r.worstCrap === null || f.crap > r.worstCrap)) r.worstCrap = f.crap;
  }
  for (const pair of pairs) {
    const mods = new Set<string>();
    for (const side of [pair.left, pair.right]) {
      const module = moduleOf(side.file);
      if (module === null) unattributedFiles.add(side.file);
      else mods.add(module);
    }
    for (const module of mods) roll(module).dupePairs += 1;
  }

  for (const r of rolls.values()) r.sourceFiles.sort();
  return {
    modules: [...rolls.values()].sort((a, b) => a.module.localeCompare(b.module)),
    unattributed: { files: [...unattributedFiles].sort(), functionCount: unattributedCount },
  };
}
