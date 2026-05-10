import LZString from 'lz-string';
import { nanoid } from 'nanoid';
import type { Expense, Group, Member, SplitMode, SplitShare } from '@/types/domain';
import { CURRENCIES } from './currencies';

export const SHARE_VERSION = 2;

const VALID_SPLIT_MODES: ReadonlySet<SplitMode> = new Set(['equal', 'percent', 'amount', 'parts']);
const VALID_CURRENCY_CODES: ReadonlySet<string> = new Set(CURRENCIES.map((c) => c.code));
const COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;

const SPLIT_MODE_CODES: Record<SplitMode, number> = { equal: 0, percent: 1, amount: 2, parts: 3 };
const SPLIT_MODE_FROM_CODE: Record<number, SplitMode> = { 0: 'equal', 1: 'percent', 2: 'amount', 3: 'parts' };

const LIMITS = {
  members: 200,
  expenses: 5000,
  sharesPerExpense: 200,
  imageIdsPerExpense: 50,
  nameLen: 80,
  groupNameLen: 120,
  titleLen: 200,
  noteLen: 1000,
  isoDateLen: 32,
  amountMinor: Number.MAX_SAFE_INTEGER,
  decimalsMin: 0,
  decimalsMax: 8,
} as const;

export class ShareDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShareDecodeError';
  }
}

/**
 * Compact share format (v2): members are referenced by index instead of id;
 * keys are single letters; default/empty fields are omitted; equal-split shares
 * are omitted entirely. Typically ~40-50% shorter than v1.
 *
 * Shape:
 *   [v, name, currency, decimals, createdAt, updatedAt, members, expenses]
 *   member  = [name] | [name, color]
 *   expense = [title, amountMinor, payerIdx, date, splitModeCode, shares?, note?, createdAt?]
 *   share   = [memberIdx]              // for equal mode (just the index)
 *           | [memberIdx, value]       // for percent/amount/parts
 */
type CompactMember = [string] | [string, string];
type CompactShare = [number] | [number, number];
type CompactExpense =
  | [string, number, number, string, number]
  | [string, number, number, string, number, CompactShare[]]
  | [string, number, number, string, number, CompactShare[], string]
  | [string, number, number, string, number, CompactShare[], string, number];
type CompactPayload = [
  number, // version
  string, // name
  string, // currency
  number, // decimals
  number, // createdAt
  number, // updatedAt
  CompactMember[],
  CompactExpense[],
];

export function encodeGroupForShare(group: Group): { token: string; strippedImages: number } {
  let strippedImages = 0;
  for (const e of group.expenses) strippedImages += e.imageIds.length;

  const memberIdxById = new Map<string, number>();
  group.members.forEach((m, i) => memberIdxById.set(m.id, i));

  const compactMembers: CompactMember[] = group.members.map((m) =>
    m.color ? [m.name, m.color] : [m.name],
  );

  const compactExpenses: CompactExpense[] = group.expenses.map((e) => {
    const payerIdx = memberIdxById.get(e.payerId);
    if (payerIdx === undefined) {
      throw new Error(`Expense ${e.id} references unknown payer ${e.payerId}.`);
    }
    const modeCode = SPLIT_MODE_CODES[e.splitMode];

    // For equal mode, we only need to know which members participate.
    // For other modes we need member + value.
    const compactShares: CompactShare[] = e.shares.map((s) => {
      const idx = memberIdxById.get(s.memberId);
      if (idx === undefined) {
        throw new Error(`Share references unknown member ${s.memberId}.`);
      }
      if (e.splitMode === 'equal') return [idx] as [number];
      return [idx, s.value] as [number, number];
    });

    // Omit shares entirely if it equals "all members" for equal mode
    // (saves bytes for the most common case).
    const allMembersInEqualOrder =
      e.splitMode === 'equal' &&
      compactShares.length === group.members.length &&
      compactShares.every(([idx], i) => idx === i);

    const base: [string, number, number, string, number] = [
      e.title,
      e.amountMinor,
      payerIdx,
      e.date,
      modeCode,
    ];

    const hasNote = e.note !== undefined && e.note !== null && e.note !== '';
    const hasCreatedAt = Number.isFinite(e.createdAt);
    const needsShares = !allMembersInEqualOrder;

    if (!needsShares && !hasNote && !hasCreatedAt) return base;
    if (!hasNote && !hasCreatedAt) return [...base, compactShares] as CompactExpense;
    if (!hasCreatedAt) {
      return [...base, needsShares ? compactShares : [], e.note ?? ''] as CompactExpense;
    }
    return [
      ...base,
      needsShares ? compactShares : [],
      e.note ?? '',
      e.createdAt,
    ] as CompactExpense;
  });

  const payload: CompactPayload = [
    SHARE_VERSION,
    group.name,
    group.currency,
    group.currencyDecimals,
    group.createdAt,
    group.updatedAt,
    compactMembers,
    compactExpenses,
  ];

  const token = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
  return { token, strippedImages };
}

export function decodeGroupFromShare(token: string): { group: Group; version: number } {
  const raw = LZString.decompressFromEncodedURIComponent(token);
  if (!raw) throw new ShareDecodeError('Could not decompress share token.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ShareDecodeError('Share payload is not valid JSON.');
  }

  // Detect format: v1 was {v: 1, group: {...}}, v2+ is a tuple [v, ...].
  if (Array.isArray(parsed)) {
    const version = readVersionFromTuple(parsed);
    if (version !== SHARE_VERSION) {
      throw new ShareDecodeError(`Unsupported share version: ${version}`);
    }
    const group = decodeCompactGroup(parsed as CompactPayload);
    return { group: assignFreshIds(group), version };
  }

  // Legacy v1 fallback.
  if (parsed && typeof parsed === 'object') {
    const v = (parsed as { v?: unknown }).v;
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      throw new ShareDecodeError('Share payload missing version.');
    }
    if (v !== 1) {
      throw new ShareDecodeError(`Unsupported share version: ${v}`);
    }
    const group = validateAndNormalizeLegacyGroup((parsed as { group: unknown }).group);
    return { group: assignFreshIds(group), version: v };
  }

  throw new ShareDecodeError('Share payload has unexpected shape.');
}

function readVersionFromTuple(arr: unknown[]): number {
  if (arr.length === 0) throw new ShareDecodeError('Share payload is empty.');
  const v = arr[0];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new ShareDecodeError('Share payload missing version.');
  }
  return v;
}

function decodeCompactGroup(payload: CompactPayload): Group {
  if (!Array.isArray(payload) || payload.length < 8) {
    throw new ShareDecodeError('Compact payload has wrong shape.');
  }
  const [, name, currency, decimals, createdAt, updatedAt, rawMembers, rawExpenses] = payload;

  const groupName = expectString(name, 'group.name', LIMITS.groupNameLen);
  const cur = expectString(currency, 'group.currency', 16);
  if (!VALID_CURRENCY_CODES.has(cur)) {
    throw new ShareDecodeError(`Unsupported currency code: ${cur}`);
  }
  const currencyDecimals = expectInt(decimals, 'group.currencyDecimals', LIMITS.decimalsMin, LIMITS.decimalsMax);
  const cAt = expectFiniteNumber(createdAt, 'group.createdAt');
  const uAt = expectFiniteNumber(updatedAt, 'group.updatedAt');

  if (!Array.isArray(rawMembers)) throw new ShareDecodeError('members must be an array.');
  if (rawMembers.length > LIMITS.members) {
    throw new ShareDecodeError(`Too many members (max ${LIMITS.members}).`);
  }
  const members: Member[] = rawMembers.map((m, i) => decodeCompactMember(m, i));

  if (!Array.isArray(rawExpenses)) throw new ShareDecodeError('expenses must be an array.');
  if (rawExpenses.length > LIMITS.expenses) {
    throw new ShareDecodeError(`Too many expenses (max ${LIMITS.expenses}).`);
  }
  const expenses: Expense[] = rawExpenses.map((e, i) =>
    decodeCompactExpense(e, i, members.length, cur),
  );

  // Placeholder ids — replaced by assignFreshIds. We need *some* unique value
  // so downstream code (validation, remapping) doesn't choke.
  const placeholderId = '__pending__';
  members.forEach((m, i) => (m.id = `m${i}`));
  expenses.forEach((e, i) => (e.id = `e${i}`));

  return {
    id: placeholderId,
    name: groupName,
    currency: cur,
    currencyDecimals,
    members,
    expenses,
    createdAt: cAt,
    updatedAt: uAt,
  };
}

function decodeCompactMember(value: unknown, index: number): Member {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    throw new ShareDecodeError(`members[${index}] must be a [name] or [name, color] tuple.`);
  }
  const name = expectString(value[0], `members[${index}].name`, LIMITS.nameLen);
  let color: string | undefined;
  if (value.length === 2 && value[1] !== undefined && value[1] !== null) {
    const colorRaw = expectString(value[1], `members[${index}].color`, 16);
    if (!COLOR_PATTERN.test(colorRaw)) {
      throw new ShareDecodeError(`members[${index}].color must be a hex color like #ff8800.`);
    }
    color = colorRaw;
  }
  // Temporary id; replaced later.
  return { id: '', name, color };
}

function decodeCompactExpense(
  value: unknown,
  index: number,
  memberCount: number,
  groupCurrency: string,
): Expense {
  if (!Array.isArray(value) || value.length < 5 || value.length > 8) {
    throw new ShareDecodeError(`expenses[${index}] must be a tuple with 5-8 elements.`);
  }
  const [title, amountMinor, payerIdx, date, modeCode, sharesRaw, noteRaw, createdAtRaw] = value as [
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown?,
    unknown?,
    unknown?,
  ];

  const titleStr = expectString(title, `expenses[${index}].title`, LIMITS.titleLen);
  const amount = expectIntNonNegative(amountMinor, `expenses[${index}].amountMinor`, LIMITS.amountMinor);
  const payerIndex = expectInt(payerIdx, `expenses[${index}].payerIdx`, 0, memberCount - 1);
  const dateStr = expectString(date, `expenses[${index}].date`, LIMITS.isoDateLen);
  const modeCodeNum = expectInt(modeCode, `expenses[${index}].splitMode`, 0, 3);
  const splitMode = SPLIT_MODE_FROM_CODE[modeCodeNum];
  if (!splitMode || !VALID_SPLIT_MODES.has(splitMode)) {
    throw new ShareDecodeError(`expenses[${index}].splitMode is invalid.`);
  }

  let shares: SplitShare[];
  const sharesProvided = sharesRaw !== undefined && Array.isArray(sharesRaw) && sharesRaw.length > 0;
  if (sharesProvided) {
    if (!Array.isArray(sharesRaw)) throw new ShareDecodeError(`expenses[${index}].shares must be an array.`);
    if (sharesRaw.length > LIMITS.sharesPerExpense) {
      throw new ShareDecodeError(`expenses[${index}].shares too many entries.`);
    }
    shares = sharesRaw.map((s, j) => decodeCompactShare(s, index, j, memberCount, splitMode));
  } else {
    // Default: every member participates equally.
    shares = Array.from({ length: memberCount }, (_, i) => ({ memberId: `m${i}`, value: 0 }));
  }

  // Validate no duplicate member references.
  const seen = new Set<string>();
  for (const s of shares) {
    if (seen.has(s.memberId)) {
      throw new ShareDecodeError(`expenses[${index}] has duplicate share member.`);
    }
    seen.add(s.memberId);
  }

  let note: string | undefined;
  if (noteRaw !== undefined && noteRaw !== null && noteRaw !== '') {
    note = expectString(noteRaw, `expenses[${index}].note`, LIMITS.noteLen);
  }

  const createdAt =
    createdAtRaw === undefined || createdAtRaw === null
      ? Date.now()
      : expectFiniteNumber(createdAtRaw, `expenses[${index}].createdAt`);

  return {
    id: '',
    groupId: '',
    title: titleStr,
    amountMinor: amount,
    currency: groupCurrency,
    payerId: `m${payerIndex}`,
    date: dateStr,
    splitMode,
    shares,
    imageIds: [],
    note,
    createdAt,
  };
}

function decodeCompactShare(
  value: unknown,
  expIdx: number,
  shareIdx: number,
  memberCount: number,
  splitMode: SplitMode,
): SplitShare {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    throw new ShareDecodeError(`expenses[${expIdx}].shares[${shareIdx}] must be a tuple.`);
  }
  const memberIndex = expectInt(value[0], `expenses[${expIdx}].shares[${shareIdx}].memberIdx`, 0, memberCount - 1);
  let v = 0;
  if (splitMode !== 'equal') {
    if (value.length !== 2) {
      throw new ShareDecodeError(`expenses[${expIdx}].shares[${shareIdx}] missing value for non-equal split.`);
    }
    if (typeof value[1] !== 'number' || !Number.isFinite(value[1])) {
      throw new ShareDecodeError(`expenses[${expIdx}].shares[${shareIdx}].value must be a finite number.`);
    }
    v = value[1];
  }
  return { memberId: `m${memberIndex}`, value: v };
}

/**
 * Replace placeholder ids (m0, m1, e0, ...) with fresh nanoids.
 * Also used by the legacy v1 path.
 */
function assignFreshIds(group: Group): Group {
  const memberMap = new Map<string, string>();
  const newMembers = group.members.map((m) => {
    const newId = nanoid();
    memberMap.set(m.id, newId);
    return { ...m, id: newId };
  });
  const newGroupId = nanoid();
  const newExpenses = group.expenses.map((e) => ({
    ...e,
    id: nanoid(),
    groupId: newGroupId,
    payerId: memberMap.get(e.payerId) ?? e.payerId,
    shares: e.shares.map((s) => ({
      ...s,
      memberId: memberMap.get(s.memberId) ?? s.memberId,
    })),
    imageIds: [],
  }));
  return { ...group, id: newGroupId, members: newMembers, expenses: newExpenses };
}

// ---------- Legacy v1 support (kept for backwards compatibility) ----------

function validateAndNormalizeLegacyGroup(value: unknown): Group {
  if (!value || typeof value !== 'object') {
    throw new ShareDecodeError('Group must be an object.');
  }
  const g = value as Record<string, unknown>;

  const id = expectString(g.id, 'group.id', 256);
  const name = expectString(g.name, 'group.name', LIMITS.groupNameLen);
  const currency = expectString(g.currency, 'group.currency', 16);
  if (!VALID_CURRENCY_CODES.has(currency)) {
    throw new ShareDecodeError(`Unsupported currency code: ${currency}`);
  }
  const currencyDecimals = expectInt(g.currencyDecimals, 'group.currencyDecimals', LIMITS.decimalsMin, LIMITS.decimalsMax);
  const createdAt = expectFiniteNumber(g.createdAt, 'group.createdAt');
  const updatedAt = expectFiniteNumber(g.updatedAt, 'group.updatedAt');

  if (!Array.isArray(g.members)) throw new ShareDecodeError('group.members must be an array.');
  if (g.members.length > LIMITS.members) {
    throw new ShareDecodeError(`Too many members (max ${LIMITS.members}).`);
  }
  const members: Member[] = g.members.map((m, i) => normalizeLegacyMember(m, i));
  const memberIds = new Set(members.map((m) => m.id));
  if (memberIds.size !== members.length) {
    throw new ShareDecodeError('Duplicate member ids.');
  }

  if (!Array.isArray(g.expenses)) throw new ShareDecodeError('group.expenses must be an array.');
  if (g.expenses.length > LIMITS.expenses) {
    throw new ShareDecodeError(`Too many expenses (max ${LIMITS.expenses}).`);
  }
  const expenses: Expense[] = g.expenses.map((e, i) =>
    normalizeLegacyExpense(e, i, memberIds, currency),
  );

  return { id, name, currency, currencyDecimals, members, expenses, createdAt, updatedAt };
}

function normalizeLegacyMember(value: unknown, index: number): Member {
  if (!value || typeof value !== 'object') {
    throw new ShareDecodeError(`members[${index}] must be an object.`);
  }
  const m = value as Record<string, unknown>;
  const id = expectString(m.id, `members[${index}].id`, 64);
  const name = expectString(m.name, `members[${index}].name`, LIMITS.nameLen);
  let color: string | undefined;
  if (m.color !== undefined && m.color !== null) {
    const colorRaw = expectString(m.color, `members[${index}].color`, 16);
    if (!COLOR_PATTERN.test(colorRaw)) {
      throw new ShareDecodeError(`members[${index}].color must be a hex color like #ff8800.`);
    }
    color = colorRaw;
  }
  return { id, name, color };
}

function normalizeLegacyExpense(
  value: unknown,
  index: number,
  memberIds: Set<string>,
  groupCurrency: string,
): Expense {
  if (!value || typeof value !== 'object') {
    throw new ShareDecodeError(`expenses[${index}] must be an object.`);
  }
  const e = value as Record<string, unknown>;
  const id = expectString(e.id, `expenses[${index}].id`, 64);
  const groupId = expectString(e.groupId, `expenses[${index}].groupId`, 64);
  const title = expectString(e.title, `expenses[${index}].title`, LIMITS.titleLen);
  const currency = expectString(e.currency, `expenses[${index}].currency`, 16);
  if (currency !== groupCurrency) {
    throw new ShareDecodeError(`expenses[${index}].currency must match group currency.`);
  }
  const amountMinor = expectIntNonNegative(e.amountMinor, `expenses[${index}].amountMinor`, LIMITS.amountMinor);
  const payerId = expectString(e.payerId, `expenses[${index}].payerId`, 64);
  if (!memberIds.has(payerId)) {
    throw new ShareDecodeError(`expenses[${index}].payerId references unknown member.`);
  }
  const date = expectString(e.date, `expenses[${index}].date`, LIMITS.isoDateLen);
  const splitModeRaw = expectString(e.splitMode, `expenses[${index}].splitMode`, 16);
  if (!VALID_SPLIT_MODES.has(splitModeRaw as SplitMode)) {
    throw new ShareDecodeError(`expenses[${index}].splitMode is invalid.`);
  }
  const splitMode = splitModeRaw as SplitMode;

  if (!Array.isArray(e.shares)) throw new ShareDecodeError(`expenses[${index}].shares must be an array.`);
  if (e.shares.length > LIMITS.sharesPerExpense) {
    throw new ShareDecodeError(`expenses[${index}].shares too many entries.`);
  }
  const shares: SplitShare[] = e.shares.map((s, j) => normalizeLegacyShare(s, index, j, memberIds));
  const seen = new Set<string>();
  for (const s of shares) {
    if (seen.has(s.memberId)) {
      throw new ShareDecodeError(`expenses[${index}] has duplicate share member.`);
    }
    seen.add(s.memberId);
  }

  if (!Array.isArray(e.imageIds)) throw new ShareDecodeError(`expenses[${index}].imageIds must be an array.`);
  if (e.imageIds.length > LIMITS.imageIdsPerExpense) {
    throw new ShareDecodeError(`expenses[${index}].imageIds too many entries.`);
  }
  const imageIds: string[] = [];

  let note: string | undefined;
  if (e.note !== undefined && e.note !== null) {
    note = expectString(e.note, `expenses[${index}].note`, LIMITS.noteLen);
  }

  const createdAt = expectFiniteNumber(e.createdAt, `expenses[${index}].createdAt`);

  return { id, groupId, title, amountMinor, currency, payerId, date, splitMode, shares, imageIds, note, createdAt };
}

function normalizeLegacyShare(
  value: unknown,
  expIdx: number,
  shareIdx: number,
  memberIds: Set<string>,
): SplitShare {
  if (!value || typeof value !== 'object') {
    throw new ShareDecodeError(`expenses[${expIdx}].shares[${shareIdx}] must be an object.`);
  }
  const s = value as Record<string, unknown>;
  const memberId = expectString(s.memberId, `expenses[${expIdx}].shares[${shareIdx}].memberId`, 64);
  if (!memberIds.has(memberId)) {
    throw new ShareDecodeError(`expenses[${expIdx}].shares[${shareIdx}].memberId references unknown member.`);
  }
  const v = s.value;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ShareDecodeError(`expenses[${expIdx}].shares[${shareIdx}].value must be a finite number.`);
  }
  return { memberId, value: v };
}

// ---------- Shared validation helpers ----------

function expectString(value: unknown, name: string, maxLen: number): string {
  if (typeof value !== 'string') throw new ShareDecodeError(`${name} must be a string.`);
  if (value.length > maxLen) throw new ShareDecodeError(`${name} exceeds ${maxLen} characters.`);
  return value;
}

function expectFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ShareDecodeError(`${name} must be a finite number.`);
  }
  return value;
}

function expectInt(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ShareDecodeError(`${name} must be an integer in [${min}, ${max}].`);
  }
  return value;
}

function expectIntNonNegative(value: unknown, name: string, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    throw new ShareDecodeError(`${name} must be a non-negative integer ≤ ${max}.`);
  }
  return value;
}

export function buildShareUrl(token: string): string {
  return `${window.location.origin}/share#g=${token}`;
}

export function readTokenFromHash(hash: string): string | null {
  const m = hash.match(/(?:^|[#&])g=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
