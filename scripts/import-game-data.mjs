/**
 * Dev-time importer for Min Hero: Tower of Sages.
 *
 * Reads the decompiled ActionScript source (local-only, gitignored) and writes
 * committed JSON under src/packs/minhero/data. The app never reads the source or
 * the network at runtime.
 *
 * Run with: npm run data:import
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = path.join(ROOT, 'minhero-towerofsages-main', 'Source Files', 'scripts');
const OUT_DIR = path.join(ROOT, 'src', 'packs', 'minhero', 'data');
const TYPES_PATH = path.join(OUT_DIR, 'types.json');

const warnings = [];

function fail(message) {
  throw new Error(message);
}

function warn(message) {
  warnings.push(message);
}

function slugify(value) {
  return value
    .toLowerCase()
    // Apostrophes become separators, so `Kel'ba` and its escaped source form
    // (`Kel\'ba`) both slug to the same stable id.
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function unescapeSourceString(value) {
  // The source is read as raw text, so escaped quotes stay escaped.
  return value.replace(/\\(['"\\])/g, '$1');
}

function normalizeName(value) {
  return unescapeSourceString(value).replace(/\s+/g, ' ').trim();
}

function parseStringLiteral(value, where) {
  const trimmed = value.trim();
  if (!/^"(?:[^"\\]|\\.)*"$/.test(trimmed)) {
    fail(`Expected a string literal at ${where}: ${trimmed}`);
  }
  return JSON.parse(trimmed);
}

function parseNumberLiteral(value, where) {
  const trimmed = value.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    fail(`Expected a number at ${where}: ${trimmed}`);
  }
  return Number(trimmed);
}

function parseBooleanLiteral(value, where) {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  fail(`Expected a boolean at ${where}: ${trimmed}`);
}

/** Splits a call's argument list without splitting nested calls/arrays. */
function splitArgs(input) {
  const args = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (char === ',' && depth === 0) {
      args.push(input.slice(start, index).trim());
      start = index + 1;
    }
  }
  const last = input.slice(start).trim();
  if (last.length > 0) args.push(last);
  return args;
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function extractFunctions(source) {
  const functions = [];
  const pattern = /(?:private|public)\s+function\s+(\w+)\s*\([^)]*\)\s*:\s*[\w.]+\s*\{/g;
  for (const match of source.matchAll(pattern)) {
    const open = source.indexOf('{', match.index);
    const close = findMatchingBrace(source, open);
    if (close < 0) fail(`Unbalanced braces in function ${match[1]}`);
    functions.push({
      name: match[1],
      body: source.slice(open + 1, close),
    });
  }
  return functions;
}

function parseConstMap(source, pattern, label) {
  const map = new Map();
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    const value = Number(match[2]);
    if (map.has(name) && map.get(name) !== value) {
      fail(`Conflicting ${label} constant ${name}: ${map.get(name)} vs ${value}`);
    }
    map.set(name, value);
  }
  return map;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

function splitStatements(body) {
  return stripComments(body)
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function readPath(relativePath) {
  return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}

async function writeJson(fileName, value) {
  await writeFile(path.join(OUT_DIR, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const typeManifest = JSON.parse(await readFile(TYPES_PATH, 'utf8'));
if (!Array.isArray(typeManifest) || typeManifest.length !== 14) {
  fail('types.json must contain exactly 14 types');
}
const typeBySourceName = new Map(typeManifest.map((type) => [type.sourceName, type.id]));
const typeById = new Map(typeManifest.map((type) => [type.id, type]));
if (typeBySourceName.size !== 14) fail('types.json has duplicate sourceName values');

const [
  typeSource,
  moveIdSource,
  moveClassSource,
  dexSource,
  minionSource,
  treeSource,
  moveSource,
  staticDataSource,
  ownedMinionSource,
] = await Promise.all([
  readPath('States/MinionType.as'),
  readPath('States/MinionMoveID.as'),
  readPath('States/MinionMoveClasses.as'),
  readPath('States/MinionDexID.as'),
  readPath('Minions/AllMinionsContainer.as'),
  readPath('Minions/BaseTalentTreeContainer.as'),
  readPath('Minions/MinionMove/AllBaseMovesContainer.as'),
  readPath('PresistentData/StaticData.as'),
  readPath('Minions/OwnedMinion.as'),
]);

const sourceTypes = parseConstMap(typeSource, /(TYPE_[A-Z_]+):int\s*=\s*(-?\d+)/g, 'type');
const moveIds = parseConstMap(moveIdSource, /(\w+):int\s*=\s*(-?\d+)/g, 'move');
const moveClasses = parseConstMap(moveClassSource, /(\w+):int\s*=\s*(-?\d+)/g, 'move class');
const dexIds = parseConstMap(dexSource, /(DEX_ID_\w+):int\s*=\s*(-?\d+)/g, 'dex');
const moveIdByNumber = new Map();
for (const [name, id] of moveIds) {
  if (name === 'NUM_OF_MOVES') continue;
  if (moveIdByNumber.has(id) && moveIdByNumber.get(id) !== name) {
    fail(`Duplicate move id ${id}: ${moveIdByNumber.get(id)} and ${name}`);
  }
  moveIdByNumber.set(id, name);
}

for (const [sourceName, typeId] of typeBySourceName) {
  if (!sourceTypes.has(sourceName)) fail(`types.json references missing source type ${sourceName}`);
  if (!typeById.has(typeId)) fail(`Unknown type id ${typeId}`);
}

function typeIdFromSource(sourceName, where) {
  if (sourceName === 'TYPE_NONE') return null;
  const typeId = typeBySourceName.get(sourceName);
  if (!typeId) fail(`Unknown source type ${sourceName} at ${where}`);
  return typeId;
}

function statIdFromSource(sourceName, where) {
  if (sourceName === 'STAT_NONE') return null;
  const match = /^STAT_([A-Z_]+)$/.exec(sourceName);
  if (!match) fail(`Unknown stat ${sourceName} at ${where}`);
  return match[1].toLowerCase();
}

function parseCall(expression, where) {
  const match = /^this\.(\w+)\(([\s\S]*)\)$/.exec(expression.trim());
  if (!match) fail(`Unsupported call at ${where}: ${expression}`);
  return { name: match[1], args: splitArgs(match[2]) };
}

function parseMoveRef(expression, where) {
  const match = /^MinionMoveID\.(\w+)$/.exec(expression.trim());
  if (!match) fail(`Expected a MinionMoveID reference at ${where}: ${expression}`);
  const name = match[1];
  const numericId = moveIds.get(name);
  if (numericId === undefined) fail(`Unknown move constant ${name} at ${where}`);
  return { name, numericId };
}

function parseClassRef(expression, where) {
  const match = /^MinionMoveClasses\.(\w+)$/.exec(expression.trim());
  if (!match) fail(`Expected a MinionMoveClasses reference at ${where}: ${expression}`);
  if (!moveClasses.has(match[1])) fail(`Unknown move class ${match[1]} at ${where}`);
  return match[1];
}

function parseTypeRef(expression, where) {
  const match = /^MinionType\.(TYPE_[A-Z_]+)$/.exec(expression.trim());
  if (!match) fail(`Expected a MinionType reference at ${where}: ${expression}`);
  return typeIdFromSource(match[1], where);
}

function parseStatRef(expression, where) {
  const match = /^StatType\.(STAT_[A-Z_]+)$/.exec(expression.trim());
  if (!match) fail(`Expected a StatType reference at ${where}: ${expression}`);
  return statIdFromSource(match[1], where);
}

function evalExpression(expression, context, where) {
  const value = expression.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (/^"(?:[^"\\]|\\.)*"$/.test(value)) return JSON.parse(value);
  const arrayRead = /^(_loc[2-5])_\[(\d+)\]$/.exec(value);
  if (arrayRead) {
    const array = context.arrays.get(arrayRead[1]);
    const index = Number(arrayRead[2]);
    if (!array || array[index] === undefined) {
      fail(`Array read out of range at ${where}: ${value}`);
    }
    return array[index];
  }
  const negativeArrayRead = /^-((_loc[2-5])_\[(\d+)\])$/.exec(value);
  if (negativeArrayRead) {
    const array = context.arrays.get(negativeArrayRead[2]);
    const index = Number(negativeArrayRead[3]);
    if (!array || array[index] === undefined) {
      fail(`Array read out of range at ${where}: ${value}`);
    }
    return -array[index];
  }
  if (value === 'this.m_armorModRate') return 0.66;
  if (value.startsWith('MinionMoveID.')) {
    return parseMoveRef(value, where).numericId;
  }
  if (value.startsWith('MinionMoveClasses.')) {
    return parseClassRef(value, where);
  }
  if (value.startsWith('MinionType.')) {
    return parseTypeRef(value, where);
  }
  if (value.startsWith('MinionVisualMoveID.')) return value;
  const replaced = value.replace(/this\.m_armorModRate/g, '0.66');
  if (/^[0-9eE+\-*/().\s]+$/.test(replaced)) {
    try {
      const result = Function(`"use strict"; return (${replaced});`)();
      if (typeof result === 'number' && Number.isFinite(result)) return result;
    } catch {
      // Fall through to the error below.
    }
  }
  fail(`Unsupported expression at ${where}: ${expression}`);
}

function numberValue(expression, context, where) {
  const value = evalExpression(expression, context, where);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`Expected a finite number at ${where}: ${expression}`);
  }
  return value;
}

function booleanValue(expression, context, where) {
  const value = evalExpression(expression, context, where);
  if (typeof value !== 'boolean') {
    fail(`Expected a boolean at ${where}: ${expression}`);
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/* Minions                                                                    */
/* -------------------------------------------------------------------------- */

const minionFunctions = extractFunctions(minionSource);
const minionsByDex = new Map();
const usedMinionIds = new Set();

for (const fn of minionFunctions) {
  const cm = /this\.CM\(MinionDexID\.(\w+),\s*"([^"]*)",\s*"([^"]*)",\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*MinionType\.(TYPE_[A-Z_]+)(?:,\s*MinionType\.(TYPE_[A-Z_]+))?\)/.exec(
    fn.body,
  );
  if (!cm) continue;

  const dexConst = cm[1];
  const dexId = dexIds.get(dexConst);
  if (dexId === undefined) fail(`Unknown dex id ${dexConst} in ${fn.name}`);
  if (dexId > 101) continue;
  if (minionsByDex.has(dexId)) fail(`Duplicate minion dex id ${dexId}`);

  const startingMoves = [...fn.body.matchAll(/AddStartingMove\(MinionMoveID\.(\w+)\)/g)].map(
    (match) => match[1],
  );
  const specializationMatch = /SetSpeacilizaionMoves\(MinionMoveID\.(\w+),\s*MinionMoveID\.(\w+),\s*MinionMoveID\.(\w+)\)/.exec(
    fn.body,
  );
  if (!specializationMatch) fail(`Missing specialization moves in ${fn.name}`);
  const specializationMoves = [
    specializationMatch[1],
    specializationMatch[2],
    specializationMatch[3],
  ];

  const treeRefs = [null, null, null];
  let lastTree = null;
  for (const line of fn.body.split(/\r?\n/)) {
    const treeMatch = /m_baseTalentTreesList\.(\w+)\(\)/.exec(line);
    if (treeMatch) lastTree = treeMatch[1];
    const setMatch = /SetTalentTree\((\d+),\s*_loc2_\)/.exec(line);
    if (setMatch && lastTree) treeRefs[Number(setMatch[1])] = lastTree;
  }
  if (treeRefs.some((ref) => !ref)) fail(`Missing talent trees in ${fn.name}`);

  const sourceTypesForMinion = [cm[9], cm[10]].filter(Boolean).map((sourceName) =>
    typeIdFromSource(sourceName, fn.name),
  );
  const types = sourceTypesForMinion.filter((typeId) => typeId !== null);
  if (types.length < 1 || types.length > 2) fail(`Invalid type count in ${fn.name}`);

  const baseStats = {
    health: Number(cm[4]),
    energy: Number(cm[5]),
    attack: Number(cm[6]),
    healing: Number(cm[7]),
    speed: Number(cm[8]),
  };
  const healthDivisor = Math.max(10, 20 - ((60 - 15) / 45) * 12);
  const maxStats = {
    health: Math.floor((baseStats.health * 60) / healthDivisor + 5),
    energy: Math.floor(((baseStats.energy * 60) / 20 + 5) * 1.5),
    attack: Math.floor((baseStats.attack * 60) / 20 + 5),
    healing: Math.floor((baseStats.healing * 60) / 20 + 5),
    speed: Math.floor((baseStats.speed * 60) / 20 + 5),
  };

  const name = normalizeName(cm[2]);
  let id = slugify(name);
  if (!id) fail(`Could not slugify minion name ${name}`);
  if (usedMinionIds.has(id)) id = `${id}-${dexId}`;
  usedMinionIds.add(id);

  const stageMatch = /_stage(\d+)$/i.exec(fn.name);
  const stage = stageMatch ? Number(stageMatch[1]) : 1;
  const gemsMatch = /m_numberOfGems = (\d+)/.exec(fn.body);
  const lockedGemsMatch = /m_numberOfLockedGems = (\d+)/.exec(fn.body);
  const evolutionMatch = /m_evolutionLevel = (\d+)/.exec(fn.body);
  const evolutionLevel = evolutionMatch ? Number(evolutionMatch[1]) : 999;

  minionsByDex.set(dexId, {
    id,
    dexId,
    dexNumber: dexId + 1,
    name,
    sprite: cm[3],
    sourceFunction: fn.name,
    stage,
    types,
    baseStats,
    maxStats,
    gems: {
      total: gemsMatch ? Number(gemsMatch[1]) : 0,
      locked: lockedGemsMatch ? Number(lockedGemsMatch[1]) : 0,
    },
    evolvesAt: evolutionLevel === 999 ? null : evolutionLevel,
    startingMoves,
    specializationMoves,
    treeIds: treeRefs,
  });
}

if (minionsByDex.size !== 102) {
  fail(`Expected 102 real minions, found ${minionsByDex.size}`);
}

/* -------------------------------------------------------------------------- */
/* Families                                                                   */
/* -------------------------------------------------------------------------- */

function groupMinions(keyFn) {
  const groups = new Map();
  for (const minion of minionsByDex.values()) {
    const key = keyFn(minion);
    const group = groups.get(key) ?? [];
    group.push(minion);
    groups.set(key, group);
  }
  return groups;
}

let familyGroups = groupMinions((minion) => minion.treeIds.join('|'));
if (familyGroups.size !== 54) {
  const fallback = groupMinions((minion) => minion.sourceFunction.replace(/_stage\d+$/i, ''));
  if (fallback.size === 54) {
    warn(`Family grouping by tree refs produced ${familyGroups.size} groups; used source function prefix instead.`);
    familyGroups = fallback;
  } else {
    fail(
      `Expected 54 families, found ${familyGroups.size} by tree refs and ${fallback.size} by function prefix`,
    );
  }
}

const families = [];
const usedFamilyIds = new Set();
for (const group of familyGroups.values()) {
  const members = [...group].sort((a, b) => a.dexId - b.dexId);
  const fullyGrown = members[members.length - 1];
  let familyId = slugify(fullyGrown.name);
  if (usedFamilyIds.has(familyId)) familyId = `${familyId}-${fullyGrown.dexId}`;
  usedFamilyIds.add(familyId);
  const family = {
    id: familyId,
    name: fullyGrown.name,
    members: members.map((member) => member.id),
  };
  families.push(family);
  for (const member of members) {
    member.familyId = family.id;
    member.familyName = family.name;
  }
}
families.sort((a, b) => a.members[0].localeCompare(b.members[0], 'en', { numeric: true }));

/* -------------------------------------------------------------------------- */
/* Trees                                                                      */
/* -------------------------------------------------------------------------- */

const trees = new Map();
for (const fn of extractFunctions(treeSource)) {
  const nameMatch = /new MinionTalentTree\("([^"]+)"\)/.exec(fn.body);
  if (!nameMatch) continue;
  const nodes = Array.from({ length: 12 }, (_, index) => ({
    col: Math.floor(index / 4),
    row: index % 4,
    moves: [],
    requiresPreviousRow: false,
  }));
  for (const match of fn.body.matchAll(
    /AddMoveToTree\((\d+),\s*(\d+),\s*MinionMoveID\.(\w+)(?:,\s*(true|false))?\)/g,
  )) {
    const col = Number(match[1]);
    const row = Number(match[2]);
    if (col < 0 || col > 2 || row < 0 || row > 3) {
      fail(`Invalid tree position ${col},${row} in ${fn.name}`);
    }
    const moveName = match[3];
    if (!moveIds.has(moveName)) fail(`Unknown tree move ${moveName} in ${fn.name}`);
    const node = nodes[col * 4 + row];
    node.moves.push(moveName);
    if (match[4] === 'true') node.requiresPreviousRow = true;
  }
  trees.set(fn.name, {
    id: fn.name,
    name: normalizeName(nameMatch[1]),
    nodes,
  });
}

for (const minion of minionsByDex.values()) {
  for (const treeId of minion.treeIds) {
    if (!trees.has(treeId)) fail(`Minion ${minion.name} references missing tree ${treeId}`);
    const tree = trees.get(treeId);
    if (!tree) continue;
    if (!tree.nodes.some((node) => node.moves.length > 0)) {
      fail(`Tree ${treeId} has no moves`);
    }
  }
}

const referencedTreeIds = new Set(
  [...minionsByDex.values()].flatMap((minion) => minion.treeIds),
);
const ignoredTrees = [...trees.keys()].filter((treeId) => !referencedTreeIds.has(treeId));
for (const treeId of ignoredTrees) trees.delete(treeId);
if (ignoredTrees.length > 0) {
  warn(`Ignored unreferenced tree definitions: ${ignoredTrees.join(', ')}`);
}

/* -------------------------------------------------------------------------- */
/* Stat stages and move descriptions                                          */
/* -------------------------------------------------------------------------- */

function readStageAmounts(field) {
  const values = [
    ...staticDataSource.matchAll(new RegExp(`this\\.${field}\\[(\\d+)\\] = ([\\d.]+);`, 'g')),
  ]
    .map((match) => ({ index: Number(match[1]), value: Number(match[2]) }))
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.value);
  if (values.length !== 10) fail(`Expected 10 values for ${field}, found ${values.length}`);
  return values;
}

const STAGE_INCREASE = readStageAmounts('m_statStageIncreaseAmounts');
const STAGE_DECREASE = readStageAmounts('m_statStageDecreaseAmounts');

/** Mirrors StaticData.GetStatStageModificationAmount. */
function stageModifier(stages) {
  if (stages === 0) return 1;
  const magnitude = Math.min(Math.abs(stages), 10);
  const table = stages > 0 ? STAGE_INCREASE : STAGE_DECREASE;
  return table[magnitude - 1];
}

/** Percentage change shown to players, e.g. +1 stage -> 25, -1 stage -> -20. */
function stagePercent(stages) {
  return Math.round((stageModifier(stages) - 1) * 100);
}

function amountRange(base, random) {
  return random > 0 ? `${base}-${base + random}` : `${base}`;
}

function turnsLabel(count) {
  return `${count} ${count === 1 ? 'turn' : 'turns'}`;
}

/**
 * Mirrors BaseMinionMove.GetTextFieldForMoveDescription so the pack carries the
 * game's own wording next to the structured fields. Lines the source omits
 * (crit, revive, % health) are appended so nothing a player would care about is
 * hidden. Passives collapse to their single stat line, like the tooltip.
 */
function describeMove(move) {
  const lines = [];
  const chanceNote = (chance) => (chance < 100 ? ` (Chance ${chance}%)` : '');
  const turns = move.overTimeTurns || 0;

  if (move.kind === 'passive' || move.kind === 'global-passive') {
    // The source checks redirect before the passive wording, so Taunt-style
    // passives describe the redirection instead of a stat.
    if (move.redirect > 0) {
      lines.push(`Redirects ${move.redirect}% of damage to this minion`);
      return lines;
    }
    const subject = move.kind === 'global-passive' ? 'Increases group' : 'Increases';
    const stat = move.buffStats[0];
    if (stat) lines.push(`${subject} ${stat} by ${move.buffPercent}%`);
    else if (move.armor > 0) lines.push(`${subject} armor by ${move.armor}%`);
    else if (move.crit > 0) lines.push(`${subject} critical hit chance by ${move.crit}%`);
    else if (move.reflect > 0) lines.push(`${subject} reflect damage by ${move.reflect}%`);
    return lines;
  }

  if (move.damage > 0 || move.randomDamage > 0) {
    lines.push(`Damage: ${amountRange(move.damage, move.randomDamage)}`);
  }
  if (move.dot > 0 || move.randomDot > 0) {
    lines.push(
      `Time Damage: ${amountRange(move.dot * turns, move.randomDot * turns)} over ${turnsLabel(turns)}`,
    );
  }
  if (move.enemiesHit === 5) lines.push('Enemies Hit: All');
  else if (move.enemiesHit > 1) {
    lines.push(`Enemies Hit: ${move.enemiesHit}${move.randomTargets ? ' random' : ''}`);
  } else if (move.randomTargets) lines.push('Enemies Hit: 1 random');

  if (move.healing > 0 || move.randomHealing > 0) {
    lines.push(`Healing: ${amountRange(move.healing, move.randomHealing)}`);
  }
  if (move.hot > 0 || move.randomHot > 0) {
    lines.push(
      `Time Healing: ${amountRange(move.hot * turns, move.randomHot * turns)} over ${turnsLabel(turns)}`,
    );
  }
  if (move.shield > 0) lines.push(`Shield: ${move.shield}`);

  if (move.alliesHit === 5) lines.push('Allies Hit: All');
  else if (move.alliesHit > 1) {
    lines.push(`Allies Hit: ${move.alliesHit}${move.randomTargets ? ' random' : ''}`);
  } else if (move.alliesHit === 1 && move.randomTargets) lines.push('Allies Hit: 1 random');

  if (move.selfDamage > 0 || move.randomSelfDamage > 0) {
    lines.push(`Recoil: ${amountRange(move.selfDamage, move.randomSelfDamage)}`);
  }
  if (move.selfHeal > 0 || move.randomSelfHeal > 0) {
    lines.push(`Self Heal: ${amountRange(move.selfHeal, move.randomSelfHeal)}`);
  }
  if (move.selfPercentageDamage > 0) {
    lines.push(`Remove Health: -${move.selfPercentageDamage}% on self`);
  }

  if (move.armor > 0) {
    lines.push(`Increases ${move.onlySelf ? 'your' : 'targets'} armor: +${move.armor}%`);
  }
  if (move.armor < 0) {
    lines.push(`Reduces ${move.onlySelf ? 'your' : 'targets'} armor: ${move.armor}%`);
  }
  if (move.armor !== 0) lines.push(`Turns active: ${move.overTimeTurns}`);

  for (const stat of move.debuffStats) {
    const prefix =
      move.debuffSelf && move.debuffTargets
        ? 'Reduces target/your'
        : move.debuffSelf
          ? 'Reduces your'
          : 'Reduces targets';
    lines.push(
      `${prefix} ${stat}: ${stagePercent(move.debuffStages)}%${chanceNote(move.debuffChance)}`,
    );
  }
  for (const stat of move.buffStats) {
    if (move.buffSelf) {
      lines.push(`Increases your ${stat}: +${stagePercent(move.buffStages)}%${chanceNote(move.buffChance)}`);
    }
    if (move.buffTargets) {
      lines.push(
        `Increases targets ${stat}: +${stagePercent(move.buffStages)}%${chanceNote(move.buffChance)}`,
      );
    }
  }

  if (move.reflect > 0) {
    lines.push(`Reflect Damage: +${move.reflect}%`);
    lines.push(`Turns active: ${move.overTimeTurns}`);
  }
  if (move.stunChance > 0) lines.push(`Stun Chance: ${move.stunChance}%`);
  if (move.freezeChance > 0) lines.push(`Freeze Chance: ${move.freezeChance}%`);
  if (move.exhaust > 0) lines.push(`Exhaustion: ${turnsLabel(move.exhaust)}`);
  if (move.charge > 0) lines.push(`Charge: ${turnsLabel(move.charge)}`);
  if (move.clearChance > 0) lines.push(`Buff/Debuff Clear Chance: ${move.clearChance}%`);
  if (move.energyRestore > 0) {
    lines.push(`Energy Restored: ${move.energyRestore}%${move.onlySelf ? ' on self' : ''}`);
  }
  if (move.accuracy < 100) lines.push(`Accuracy: ${move.accuracy}%`);
  if (move.cooldown > 0) lines.push(`Cooldown: ${turnsLabel(move.cooldown)}`);
  if (move.energy > 0) lines.push(`Energy: ${move.energy}`);
  if (move.crit > 0) lines.push(`Critical chance: +${move.crit}%`);
  if (move.redirect > 0) lines.push(`Redirects ${move.redirect}% of damage to this minion`);
  if (move.reviveChance > 0) lines.push(`Revive Chance: ${move.reviveChance}%`);
  if (move.percentHealthRemoved > 0) lines.push(`Removes ${move.percentHealthRemoved}% of health`);

  return lines;
}

/* -------------------------------------------------------------------------- */
/* Moves                                                                      */
/* -------------------------------------------------------------------------- */

const movesByNumber = new Map();
const createMoveFunctions = extractFunctions(moveSource).filter((fn) =>
  /^Create\w+Moves$/.test(fn.name),
);
if (createMoveFunctions.length !== 15) {
  fail(`Expected 15 move creation methods, found ${createMoveFunctions.length}`);
}

const numericFieldMap = {
  m_damage: 'damage',
  m_additionalRandomDamage: 'randomDamage',
  m_DOTDamage: 'dot',
  m_additionalDOTDamage: 'randomDot',
  m_healing: 'healing',
  m_additionalRandomHealing: 'randomHealing',
  m_HOTHealing: 'hot',
  m_additionalHOTHealing: 'randomHot',
  m_selfHeal: 'selfHeal',
  m_additionalRandomSelfHeal: 'randomSelfHeal',
  m_selfDamage: 'selfDamage',
  m_additionalRandomSelfDamage: 'randomSelfDamage',
  m_selfPercentageDamage: 'selfPercentageDamage',
  m_percentageOfHealthRemoved: 'percentHealthRemoved',
  m_energyUsed: 'energy',
  m_energyPercentageRestored: 'energyRestore',
  m_accuracy: 'accuracy',
  m_moveCoolDownTime: 'cooldown',
  m_chargeTime: 'charge',
  m_exhaustTime: 'exhaust',
  m_enemiesItHits: 'enemiesHit',
  m_alliesItHits: 'alliesHit',
  m_stunChance: 'stunChance',
  m_freezeChance: 'freezeChance',
  m_clearBuffsAndDebuffsChance: 'clearChance',
  m_reviveChance: 'reviveChance',
  m_percentageOfDamageThatGetsRedirectedAtMinion: 'redirect',
  m_setShieldAmount: 'shield',
  m_setReflectDamageAmount: 'reflect',
  m_increasedExtraCritChance: 'crit',
  m_armor: 'armor',
  m_stagesOfStatTypeToBuff: 'buffStages',
  m_stagesOfStatTypeToDeBuff: 'debuffStages',
  m_chanceToBuff: 'buffChance',
  m_chanceToDeBuff: 'debuffChance',
  m_overTimeTurnsActive: 'overTimeTurns',
};

const booleanFieldMap = {
  m_hitsRandomTargets: 'randomTargets',
  m_onlyHitsSelf: 'onlySelf',
  m_doesHitEachEnemy: 'hitsEachEnemy',
  m_isThereABufferBetweenVisualMovesOnMultipleEnemies: 'visualBuffer',
  m_doesBuffSelf: 'buffSelf',
  m_doesBuffTargets: 'buffTargets',
  m_doesDeBuffSelf: 'debuffSelf',
  m_doesDeBuffTargets: 'debuffTargets',
};

function createMoveRecord({
  idConst,
  name,
  classId,
  tier,
  type,
  energy,
  kind = 'active',
  accuracy = 100,
  icon = null,
  sourceFunction,
  where,
}) {
  const numericId = moveIds.get(idConst);
  if (numericId === undefined) fail(`Unknown move constant ${idConst} at ${where}`);
  if (movesByNumber.has(numericId)) {
    fail(`Duplicate move id ${numericId} (${idConst}) at ${where}`);
  }
  const classNumericId = moveClasses.get(classId);
  if (classNumericId === undefined) fail(`Unknown move class ${classId} at ${where}`);
  const move = {
    id: idConst,
    numericId,
    name: normalizeName(name),
    classId,
    classNumericId,
    tier,
    level: tier + 1,
    type,
    kind,
    icon,
    energy,
    accuracy,
    cooldown: 0,
    charge: 0,
    exhaust: 0,
    damage: 0,
    randomDamage: 0,
    dot: 0,
    randomDot: 0,
    healing: 0,
    randomHealing: 0,
    hot: 0,
    randomHot: 0,
    selfHeal: 0,
    randomSelfHeal: 0,
    selfDamage: 0,
    randomSelfDamage: 0,
    selfPercentageDamage: 0,
    percentHealthRemoved: 0,
    enemiesHit: 1,
    alliesHit: 0,
    randomTargets: false,
    onlySelf: false,
    hitsEachEnemy: true,
    visualBuffer: true,
    armor: 0,
    shield: 0,
    reflect: 0,
    redirect: 0,
    crit: 0,
    stunChance: 0,
    freezeChance: 0,
    clearChance: 0,
    reviveChance: 0,
    energyRestore: 0,
    overTimeTurns: 3,
    buffStats: [],
    debuffStats: [],
    buffStages: 1,
    debuffStages: -1,
    buffChance: 100,
    debuffChance: 100,
    buffSelf: false,
    buffTargets: false,
    debuffSelf: false,
    debuffTargets: false,
    buffPercent: 0,
    effects: [],
    sourceFunction,
  };
  movesByNumber.set(numericId, move);
  return move;
}

function applyMoveCall(call, context, where) {
  const { name, args } = call;
  if (name === 'CreateMove') {
    if (args.length < 7) fail(`CreateMove needs at least 7 args at ${where}`);
    const moveRef = parseMoveRef(args[3], where);
    return createMoveRecord({
      idConst: moveRef.name,
      name: parseStringLiteral(args[0], where),
      classId: parseClassRef(args[2], where),
      tier: 0,
      type: parseTypeRef(args[5], where),
      energy: numberValue(args[1], context, where),
      // CreateMove takes the icon explicitly; older helpers read m_currMoveIconName.
      icon: args[4] ? parseStringLiteral(args[4], where) : context.currentIcon,
      sourceFunction: context.functionName,
      where,
    });
  }

  if (name === 'CopyMove') {
    if (!context.currentMove) fail(`CopyMove without a current move at ${where}`);
    const previous = context.currentMove;
    const newTier = previous.tier + 1;
    const newId = previous.numericId + 1;
    const idConst = moveIdByNumber.get(newId);
    if (!idConst) fail(`CopyMove produced unknown move id ${newId} at ${where}`);
    const baseName = movesByNumber.get(newId - newTier)?.name ?? previous.name.replace(/\s+lv\.\d+$/i, '');
    const explicitName = args[2] ? parseStringLiteral(args[2], where) : `${baseName} lv.${newTier + 1}`;
    const cloned = {
      ...previous,
      id: idConst,
      numericId: newId,
      name: normalizeName(explicitName),
      tier: newTier,
      level: newTier + 1,
      energy: numberValue(args[1], context, where),
      buffStats: [...previous.buffStats],
      debuffStats: [...previous.debuffStats],
      effects: [],
      sourceFunction: context.functionName,
    };
    if (movesByNumber.has(newId)) fail(`Duplicate move id ${newId} from CopyMove at ${where}`);
    movesByNumber.set(newId, cloned);
    return cloned;
  }

  if (name === 'PassiveCM') {
    if (args.length < 3) fail(`PassiveCM needs at least 3 args at ${where}`);
    const index = numberValue(args[0], context, where);
    const numericId = context.currentFirstId + index;
    const idConst = moveIdByNumber.get(numericId);
    if (!idConst) fail(`PassiveCM produced unknown move id ${numericId} at ${where}`);
    const stat = parseStatRef(args[2], where);
    const amount = args[3] ? numberValue(args[3], context, where) : 0;
    const global = args[4] ? booleanValue(args[4], context, where) : false;
    const move = createMoveRecord({
      idConst,
      name: parseStringLiteral(args[1], where),
      classId: context.currentClass,
      tier: index,
      type: null,
      energy: 0,
      kind: global ? 'global-passive' : 'passive',
      icon: context.currentIcon,
      sourceFunction: context.functionName,
      where,
    });
    if (stat) {
      move.buffStats.push(stat);
      move.buffPercent = amount;
    }
    return move;
  }

  if (name === 'old_FireCM') {
    const index = numberValue(args[0], context, where);
    const move = helperMove(context, index, parseStringLiteral(args[1], where), 'fire', where);
    move.damage = numberValue(args[2], context, where);
    move.randomDamage = numberValue(args[3], context, where);
    move.dot = numberValue(args[4], context, where);
    move.randomDot = numberValue(args[5], context, where);
    move.energy = numberValue(args[6], context, where);
    move.cooldown = args[7] ? numberValue(args[7], context, where) : 0;
    move.enemiesHit = args[8] ? numberValue(args[8], context, where) : 1;
    move.randomTargets = args[9] ? booleanValue(args[9], context, where) : false;
    return move;
  }

  if (name === 'old_NormalCM') {
    const index = numberValue(args[0], context, where);
    const move = helperMove(context, index, parseStringLiteral(args[1], where), 'normal', where);
    move.damage = numberValue(args[2], context, where);
    move.randomDamage = numberValue(args[3], context, where);
    move.dot = numberValue(args[4], context, where);
    move.energy = numberValue(args[5], context, where);
    move.accuracy = args[6] ? numberValue(args[6], context, where) : 100;
    move.cooldown = args[7] ? numberValue(args[7], context, where) : 0;
    return move;
  }

  if (name === 'old_EnergyCM') {
    const index = numberValue(args[0], context, where);
    const move = helperMove(context, index, parseStringLiteral(args[1], where), 'electric', where);
    move.damage = numberValue(args[2], context, where);
    move.randomDamage = numberValue(args[3], context, where);
    move.energy = numberValue(args[4], context, where);
    move.enemiesHit = args[5] ? numberValue(args[5], context, where) : 1;
    move.accuracy = args[6] ? numberValue(args[6], context, where) : 100;
    move.cooldown = args[7] ? numberValue(args[7], context, where) : 0;
    move.stunChance = args[8] ? numberValue(args[8], context, where) : 0;
    return move;
  }

  if (name === 'old_EarthCM') {
    const index = numberValue(args[0], context, where);
    const move = helperMove(context, index, parseStringLiteral(args[1], where), 'earth', where);
    move.damage = numberValue(args[2], context, where);
    move.randomDamage = numberValue(args[3], context, where);
    move.energy = numberValue(args[4], context, where);
    move.armor = args[5] ? numberValue(args[5], context, where) : 0;
    move.cooldown = args[6] ? numberValue(args[6], context, where) : 0;
    move.enemiesHit = args[7] ? numberValue(args[7], context, where) : 1;
    move.randomTargets = args[8] ? booleanValue(args[8], context, where) : false;
    return move;
  }

  fail(`Unsupported move helper ${name} at ${where}`);
}

function helperMove(context, index, name, type, where) {
  const numericId = context.currentFirstId + index;
  const idConst = moveIdByNumber.get(numericId);
  if (!idConst) fail(`Helper produced unknown move id ${numericId} at ${where}`);
  return createMoveRecord({
    idConst,
    name,
    classId: context.currentClass,
    tier: index,
    type,
    energy: 0,
    icon: context.currentIcon,
    sourceFunction: context.functionName,
    where,
  });
}

function applyMoveAssignment(move, field, expression, context, where) {
  if (field === 'm_moveType') {
    move.type = parseTypeRef(expression, where);
    return;
  }
  if (field === 'm_isPassive') {
    move.kind = booleanValue(expression, context, where) ? 'passive' : 'active';
    return;
  }
  if (field === 'm_isGlobalPassive') {
    move.kind = booleanValue(expression, context, where) ? 'global-passive' : 'passive';
    return;
  }
  if (field in numericFieldMap) {
    move[numericFieldMap[field]] = numberValue(expression, context, where);
    return;
  }
  if (field in booleanFieldMap) {
    move[booleanFieldMap[field]] = booleanValue(expression, context, where);
    return;
  }
  fail(`Unsupported move field ${field} at ${where}`);
}

function applyStatCall(move, name, args, context, where) {
  if (args.length < 1) fail(`Missing stat argument at ${where}`);
  const stat = parseStatRef(args[0], where);
  if (!stat) return;
  if (name === 'AddStatToBuff') {
    move.buffStats.push(stat);
    return;
  }
  if (name === 'AddStatToDeBuff') {
    move.debuffStats.push(stat);
    return;
  }
  if (name === 'AddStatToBuffFirstTime') {
    move.buffStats.push(stat);
    move.buffTargets = args[1] ? booleanValue(args[1], context, where) : false;
    move.buffSelf = args[2] ? booleanValue(args[2], context, where) : false;
    move.buffStages = args[3] ? numberValue(args[3], context, where) : 1;
    move.buffChance = args[4] ? numberValue(args[4], context, where) : 100;
    return;
  }
  if (name === 'AddStatToDeBuffFirstTime') {
    move.debuffStats.push(stat);
    move.debuffTargets = args[1] ? booleanValue(args[1], context, where) : false;
    move.debuffSelf = args[2] ? booleanValue(args[2], context, where) : false;
    move.debuffStages = -(args[3] ? Math.abs(numberValue(args[3], context, where)) : 1);
    move.debuffChance = args[4] ? numberValue(args[4], context, where) : 100;
    return;
  }
  fail(`Unsupported stat call ${name} at ${where}`);
}

function finalizeMove(move) {
  const effects = [];
  if (move.kind === 'passive' || move.kind === 'global-passive') {
    for (const stat of move.buffStats) {
      effects.push({
        kind: 'buff',
        stat,
        percent: move.buffPercent,
        scope: move.kind === 'global-passive' ? 'team' : 'self',
        passive: true,
      });
    }
  } else {
    for (const stat of move.buffStats) {
      effects.push({
        kind: 'buff',
        stat,
        stages: move.buffStages,
        chance: move.buffChance,
        target: move.buffSelf ? 'self' : move.buffTargets ? 'targets' : 'self',
      });
    }
    for (const stat of move.debuffStats) {
      effects.push({
        kind: 'debuff',
        stat,
        stages: move.debuffStages,
        chance: move.debuffChance,
        target: move.debuffSelf ? 'self' : move.debuffTargets ? 'targets' : 'targets',
      });
    }
  }
  if (move.stunChance > 0) effects.push({ kind: 'stun', chance: move.stunChance });
  if (move.freezeChance > 0) effects.push({ kind: 'freeze', chance: move.freezeChance });
  if (move.clearChance > 0) effects.push({ kind: 'clear', chance: move.clearChance });
  if (move.reviveChance > 0) effects.push({ kind: 'revive', chance: move.reviveChance });
  if (move.shield > 0) effects.push({ kind: 'shield', amount: move.shield });
  if (move.reflect > 0) effects.push({ kind: 'reflect', amount: move.reflect });
  if (move.redirect > 0) effects.push({ kind: 'redirect', percent: move.redirect });
  if (move.armor !== 0) effects.push({ kind: 'armor', amount: move.armor });
  if (move.crit > 0) effects.push({ kind: 'crit', percent: move.crit });
  if (move.energyRestore > 0) effects.push({ kind: 'energy', percent: move.energyRestore });
  return { ...move, description: describeMove(move), effects };
}

for (const fn of createMoveFunctions) {
  const context = {
    functionName: fn.name,
    currentClass: null,
    currentFirstId: null,
    currentMove: null,
    currentIcon: null,
    arrays: new Map(),
  };
  let currentVisual = null;
  let currentDotVisual = null;

  for (const statement of splitStatements(fn.body)) {
    const where = `${fn.name}: ${statement}`;
    let match;

    if (/^var _loc[1-5]_:[A-Za-z0-9_.<>]+ = null$/.test(statement)) {
      const name = statement.slice(4, 10);
      if (name === '_loc1_') context.currentMove = null;
      else context.arrays.delete(name);
      continue;
    }
    if ((match = /^this\.m_currMinionMoveClass = MinionMoveClasses\.(\w+)$/.exec(statement))) {
      if (!moveClasses.has(match[1])) fail(`Unknown move class ${match[1]} at ${where}`);
      context.currentClass = match[1];
      continue;
    }
    if ((match = /^this\.m_currFirstMinionMoveID = MinionMoveID\.(\w+)$/.exec(statement))) {
      const id = moveIds.get(match[1]);
      if (id === undefined) fail(`Unknown move constant ${match[1]} at ${where}`);
      context.currentFirstId = id;
      continue;
    }
    if ((match = /^this\.m_currMoveIconName = ("(?:[^"\\]|\\.)*")$/.exec(statement))) {
      context.currentIcon = parseStringLiteral(match[1], where);
      continue;
    }
    if ((match = /^this\.m_currMinionMoveVisuals = (.+)$/.exec(statement))) {
      currentVisual = match[1].trim();
      continue;
    }
    if ((match = /^this\.m_currMinionDOTMoveVisuals = (.+)$/.exec(statement))) {
      currentDotVisual = match[1].trim();
      continue;
    }
    if ((match = /^(_loc[2-5])_ = new Array\(([\s\S]*)\)$/.exec(statement))) {
      const arrayName = match[1];
      const values = match[2].trim() ? splitArgs(match[2]).map((arg) => numberValue(arg, context, where)) : [];
      context.arrays.set(arrayName, values);
      continue;
    }
    if ((match = /^_loc1_ = (this\.[\s\S]+)$/.exec(statement))) {
      const call = parseCall(match[1], where);
      context.currentMove = applyMoveCall(call, context, where);
      continue;
    }
    if ((match = /^_loc1_\.(\w+) = ([\s\S]+)$/.exec(statement))) {
      if (!context.currentMove) fail(`Move assignment before creation at ${where}`);
      applyMoveAssignment(context.currentMove, match[1], match[2], context, where);
      continue;
    }
    if ((match = /^_loc1_\.(AddStatToBuff|AddStatToDeBuff|AddStatToBuffFirstTime|AddStatToDeBuffFirstTime)\(([\s\S]*)\)$/.exec(statement))) {
      if (!context.currentMove) fail(`Stat assignment before move creation at ${where}`);
      applyStatCall(context.currentMove, match[1], splitArgs(match[2]), context, where);
      continue;
    }
    fail(`Unsupported statement in ${fn.name}: ${statement}`);
  }
}

const declaredMoveCount = moveIds.get('NUM_OF_MOVES') ?? 893;
const missingMoveIds = [];
for (let id = 0; id < declaredMoveCount; id += 1) {
  if (!movesByNumber.has(id)) missingMoveIds.push(id);
}
// IDs 135-139 are the source's undocumented/glitched slots; no move object is
// created for them and the wiki also lists them as unknown.
const allowedMissingMoveIds = new Set([135, 136, 137, 138, 139]);
const unexpectedMissing = missingMoveIds.filter((id) => !allowedMissingMoveIds.has(id));
if (unexpectedMissing.length > 0) {
  fail(
    `Missing unexpected move ids: ${unexpectedMissing
      .map((id) => `${id}:${moveIdByNumber.get(id) ?? '?'}`)
      .join(', ')}`,
  );
}
if (movesByNumber.size !== declaredMoveCount - missingMoveIds.length) {
  fail(
    `Expected ${declaredMoveCount - missingMoveIds.length} defined moves, parsed ${movesByNumber.size}`,
  );
}
if (missingMoveIds.length > 0) {
  warn(
    `Source declares ${declaredMoveCount} move slots; ids ${missingMoveIds.join(
      ', ',
    )} are undocumented/glitched and have no move records.`,
  );
}

const treesById = new Map([...trees.entries()]);
const referencedMoveIds = new Set();
for (const tree of treesById.values()) {
  for (const node of tree.nodes) {
    for (const moveId of node.moves) referencedMoveIds.add(moveId);
  }
}
for (const minion of minionsByDex.values()) {
  for (const moveId of minion.startingMoves) {
    if (!moveIds.has(moveId)) fail(`Unknown starting move ${moveId} on ${minion.name}`);
    referencedMoveIds.add(moveId);
  }
  for (const moveId of minion.specializationMoves) {
    if (!moveIds.has(moveId)) fail(`Unknown specialization move ${moveId} on ${minion.name}`);
    referencedMoveIds.add(moveId);
  }
}

const moves = [...movesByNumber.values()]
  .sort((a, b) => a.numericId - b.numericId)
  .map((move) => ({
    ...finalizeMove(move),
    obtainable: referencedMoveIds.has(move.id),
  }));

/* -------------------------------------------------------------------------- */
/* Type chart                                                                 */
/* -------------------------------------------------------------------------- */

const staticFunctions = extractFunctions(staticDataSource);
const chartFn = staticFunctions.find((fn) => fn.name === 'SetupTypeEffectivenessArray');
if (!chartFn) fail('Missing SetupTypeEffectivenessArray');
const typeIds = typeManifest.map((type) => type.id);
const matrix = {};
for (const attacker of typeIds) {
  matrix[attacker] = {};
  for (const defender of typeIds) matrix[attacker][defender] = 'neutral';
}
for (const match of chartFn.body.matchAll(
  /this\.m_typeEffectivenessArray\[MinionType\.(TYPE_[A-Z_]+)\]\[MinionType\.(TYPE_[A-Z_]+)\] = this\.(SUPER_EFFECTIVE_MODIFIER|NOT_EFFECTIVE_MODIFIER);/g,
)) {
  const attacker = typeIdFromSource(match[1], 'SetupTypeEffectivenessArray');
  const defender = typeIdFromSource(match[2], 'SetupTypeEffectivenessArray');
  if (!attacker || !defender) fail(`Unexpected TYPE_NONE in chart: ${match[1]} vs ${match[2]}`);
  const code = match[3] === 'SUPER_EFFECTIVE_MODIFIER' ? 'weak' : 'resist';
  const existing = matrix[attacker][defender];
  if (existing !== 'neutral' && existing !== code) {
    fail(`Conflicting chart cell ${attacker} -> ${defender}: ${existing} vs ${code}`);
  }
  matrix[attacker][defender] = code;
}

const stabMatch = /public const STAB_MODIFIER:Number = ([\d.]+);/.exec(staticDataSource);
const weakMatch = /public const SUPER_EFFECTIVE_MODIFIER:Number = ([\d.]+);/.exec(staticDataSource);
const resistMatch = /public const NOT_EFFECTIVE_MODIFIER:Number = ([\d.]+);/.exec(staticDataSource);
const teamSizeMatch = /MAX_NUM_OF_MINIONS_IN_GROUP:int = (\d+);/.exec(staticDataSource);
if (!stabMatch || !weakMatch || !resistMatch || !teamSizeMatch) {
  fail('Could not read core combat constants from StaticData.as');
}

const ownedConstantsMatch = /private const m_baseHealth:int = 5;[\s\S]*?private const m_statDivisor:int = 20;/.test(
  ownedMinionSource,
);
if (!ownedConstantsMatch) warn('Could not confirm OwnedMinion stat constants; used known values.');

/* -------------------------------------------------------------------------- */
/* Output                                                                     */
/* -------------------------------------------------------------------------- */

const types = typeManifest;
const minions = [...minionsByDex.values()].sort((a, b) => a.dexId - b.dexId);
const treeList = [...treesById.values()].sort((a, b) => a.id.localeCompare(b.id));
const sourceHash = createHash('sha256')
  .update(
    [
      typeSource,
      moveIdSource,
      moveClassSource,
      dexSource,
      minionSource,
      treeSource,
      moveSource,
      staticDataSource,
      ownedMinionSource,
    ].join('\n'),
  )
  .digest('hex');

await mkdir(OUT_DIR, { recursive: true });
await writeJson('types.json', types);
await writeJson('typechart.json', { types: typeIds, matrix });
await writeJson('minions.json', minions);
await writeJson('families.json', families);
await writeJson('trees.json', treeList);
await writeJson('moves.json', moves);
await writeJson('meta.json', {
  source: {
    path: 'minhero-towerofsages-main/Source Files/scripts',
    hash: sourceHash,
    attribution: 'Min Hero: Tower of Sages © ToyChestGames. Source used with permission.',
  },
  rules: {
    teamSize: Number(teamSizeMatch[1]),
    maxLevel: 60,
    skillPointsAtMax: 17,
    treeColumns: 3,
    treeRows: 4,
    rowPointRequirement: 3,
    secondaryTreeUnlockAt: 11,
    stabModifier: Number(stabMatch[1]),
    weakModifier: Number(weakMatch[1]),
    resistModifier: Number(resistMatch[1]),
  },
  counts: {
    types: types.length,
    minions: minions.length,
    families: families.length,
    trees: treeList.length,
    moves: moves.length,
    declaredMoveSlots: declaredMoveCount,
    unknownMoveIds: missingMoveIds,
    ignoredTreeIds: ignoredTrees,
    obtainableMoves: moves.filter((move) => move.obtainable).length,
  },
  warnings,
});
await writeJson('types.json', types);

console.log('Imported Min Hero data:');
console.log(`  minions: ${minions.length}`);
console.log(`  families: ${families.length}`);
console.log(`  trees: ${treeList.length}`);
console.log(`  moves: ${moves.length} (${moves.filter((move) => move.obtainable).length} referenced)`);
console.log(`  types: ${types.length}`);
console.log(`  source hash: ${sourceHash}`);
if (warnings.length > 0) {
  console.warn('Warnings:');
  for (const message of warnings) console.warn(`  - ${message}`);
}
