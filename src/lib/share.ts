import LZString from 'lz-string';
import { nanoid } from 'nanoid';
import type { Expense, Group, Member, SplitMode, SplitShare } from '@/types/domain';
import { CURRENCIES } from './currencies';

export const SHARE_VERSION = 1;

const VALID_SPLIT_MODES: ReadonlySet<SplitMode> = new Set(['equal', 'percent', 'amount', 'parts']);
const VALID_CURRENCY_CODES: ReadonlySet<string> = new Set(CURRENCIES.map((c) => c.code));
const COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;

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

interface SharePayload {
  v: number;
  group: Group;
}

export class ShareDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShareDecodeError';
  }
}

export function encodeGroupForShare(group: Group): { token: string; strippedImages: number } {
  let strippedImages = 0;
  const sanitized: Group = {
    ...group,
    expenses: group.expenses.map((e) => {
      strippedImages += e.imageIds.length;
      return { ...e, imageIds: [] };
    }),
  };
  const payload: SharePayload = { v: SHARE_VERSION, group: sanitized };
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
  const version = readVersion(parsed);
  if (version !== SHARE_VERSION) {
    throw new ShareDecodeError(`Unsupported share version: ${version}`);
  }
  const group = validateAndNormalizeGroup((parsed as { group: unknown }).group);
  return { group: remapIds(group), version };
}

function readVersion(parsed: unknown): number {
  if (!parsed || typeof parsed !== 'object') {
    throw new ShareDecodeError('Share payload has unexpected shape.');
  }
  const v = (parsed as { v?: unknown }).v;
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new ShareDecodeError('Share payload missing version.');
  }
  return v;
}

function validateAndNormalizeGroup(value: unknown): Group {
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
  const members: Member[] = g.members.map((m, i) => normalizeMember(m, i));
  const memberIds = new Set(members.map((m) => m.id));
  if (memberIds.size !== members.length) {
    throw new ShareDecodeError('Duplicate member ids.');
  }

  if (!Array.isArray(g.expenses)) throw new ShareDecodeError('group.expenses must be an array.');
  if (g.expenses.length > LIMITS.expenses) {
    throw new ShareDecodeError(`Too many expenses (max ${LIMITS.expenses}).`);
  }
  const expenses: Expense[] = g.expenses.map((e, i) => normalizeExpense(e, i, memberIds, currency));

  return { id, name, currency, currencyDecimals, members, expenses, createdAt, updatedAt };
}

function normalizeMember(value: unknown, index: number): Member {
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

function normalizeExpense(value: unknown, index: number, memberIds: Set<string>, groupCurrency: string): Expense {
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
  const shares: SplitShare[] = e.shares.map((s, j) => normalizeShare(s, index, j, memberIds));
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
  // Image ids are dropped on share, but a malicious sender could put them in;
  // we just discard.
  const imageIds: string[] = [];

  let note: string | undefined;
  if (e.note !== undefined && e.note !== null) {
    note = expectString(e.note, `expenses[${index}].note`, LIMITS.noteLen);
  }

  const createdAt = expectFiniteNumber(e.createdAt, `expenses[${index}].createdAt`);

  return { id, groupId, title, amountMinor, currency, payerId, date, splitMode, shares, imageIds, note, createdAt };
}

function normalizeShare(value: unknown, expIdx: number, shareIdx: number, memberIds: Set<string>): SplitShare {
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

function remapIds(group: Group): Group {
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

export function buildShareUrl(token: string): string {
  return `${window.location.origin}/share#g=${token}`;
}

export function readTokenFromHash(hash: string): string | null {
  const m = hash.match(/(?:^|[#&])g=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
