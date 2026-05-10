import { describe, it, expect } from 'vitest';
import LZString from 'lz-string';
import { encodeGroupForShare, decodeGroupFromShare, ShareDecodeError } from './share';
import type { Group } from '@/types/domain';

function makeGroup(): Group {
  return {
    id: 'g1',
    name: 'Trip to Lisbon',
    currency: 'EUR',
    currencyDecimals: 2,
    members: [
      { id: 'm1', name: 'Alice', color: '#f00' },
      { id: 'm2', name: 'Bob', color: '#0f0' },
    ],
    expenses: [
      {
        id: 'e1',
        groupId: 'g1',
        title: 'Dinner',
        amountMinor: 4000,
        currency: 'EUR',
        payerId: 'm1',
        date: '2026-01-01',
        splitMode: 'equal',
        shares: [
          { memberId: 'm1', value: 0 },
          { memberId: 'm2', value: 0 },
        ],
        imageIds: ['img1', 'img2'],
        createdAt: 0,
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('share encode/decode', () => {
  it('strips image ids and reports count', () => {
    const { token, strippedImages } = encodeGroupForShare(makeGroup());
    expect(strippedImages).toBe(2);
    expect(token).toBeTruthy();
    const { group } = decodeGroupFromShare(token);
    expect(group.expenses[0].imageIds).toEqual([]);
  });

  it('round-trip preserves business data (modulo fresh ids)', () => {
    const original = makeGroup();
    const { token } = encodeGroupForShare(original);
    const { group: restored } = decodeGroupFromShare(token);

    expect(restored.name).toBe(original.name);
    expect(restored.currency).toBe(original.currency);
    expect(restored.members.map((m) => m.name)).toEqual(original.members.map((m) => m.name));
    expect(restored.expenses[0].title).toBe(original.expenses[0].title);
    expect(restored.expenses[0].amountMinor).toBe(original.expenses[0].amountMinor);

    // Ids must be remapped (different from originals)
    expect(restored.id).not.toBe(original.id);
    restored.members.forEach((m, idx) => {
      expect(m.id).not.toBe(original.members[idx].id);
    });

    // Payer/share refs must point to the new ids
    const newPayerId = restored.expenses[0].payerId;
    expect(restored.members.some((m) => m.id === newPayerId)).toBe(true);
    restored.expenses[0].shares.forEach((s) => {
      expect(restored.members.some((m) => m.id === s.memberId)).toBe(true);
    });
  });

  it('rejects corrupted token', () => {
    expect(() => decodeGroupFromShare('!!!not-a-real-token!!!')).toThrow(ShareDecodeError);
  });

  it('rejects unsupported version', () => {
    const payload = { v: 99, group: makeGroup() };
    const tokenV2 = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
    expect(() => decodeGroupFromShare(tokenV2)).toThrow(ShareDecodeError);
  });

  describe('rejects malicious payloads', () => {
    function tokenFor(group: unknown, version = 1): string {
      return LZString.compressToEncodedURIComponent(JSON.stringify({ v: version, group }));
    }

    it('rejects too many members', () => {
      const g: any = { ...makeGroup() };
      g.members = Array.from({ length: 10_000 }, (_, i) => ({ id: `m${i}`, name: 'x' }));
      expect(() => decodeGroupFromShare(tokenFor(g))).toThrow(ShareDecodeError);
    });

    it('rejects too many expenses', () => {
      const g: any = { ...makeGroup() };
      g.expenses = Array.from({ length: 6000 }, () => g.expenses[0]);
      expect(() => decodeGroupFromShare(tokenFor(g))).toThrow(ShareDecodeError);
    });

    it('rejects unknown splitMode', () => {
      const g: any = JSON.parse(JSON.stringify(makeGroup()));
      g.expenses[0].splitMode = 'foo';
      expect(() => decodeGroupFromShare(tokenFor(g))).toThrow(ShareDecodeError);
    });

    it('rejects non-finite amountMinor', () => {
      const g: any = JSON.parse(JSON.stringify(makeGroup()));
      g.expenses[0].amountMinor = 'huge';
      expect(() => decodeGroupFromShare(tokenFor(g))).toThrow(ShareDecodeError);
    });

    it('rejects unknown currency code', () => {
      const g: any = JSON.parse(JSON.stringify(makeGroup()));
      g.currency = 'XXX';
      expect(() => decodeGroupFromShare(tokenFor(g))).toThrow(ShareDecodeError);
    });

    it('rejects payerId not in members', () => {
      const g: any = JSON.parse(JSON.stringify(makeGroup()));
      g.expenses[0].payerId = 'ghost';
      expect(() => decodeGroupFromShare(tokenFor(g))).toThrow(ShareDecodeError);
    });

    it('rejects share.memberId not in members', () => {
      const g: any = JSON.parse(JSON.stringify(makeGroup()));
      g.expenses[0].shares[0].memberId = 'ghost';
      expect(() => decodeGroupFromShare(tokenFor(g))).toThrow(ShareDecodeError);
    });

    it('rejects non-hex member.color', () => {
      const g: any = JSON.parse(JSON.stringify(makeGroup()));
      g.members[0].color = 'red; foo: bar';
      expect(() => decodeGroupFromShare(tokenFor(g))).toThrow(ShareDecodeError);
    });

    it('rejects oversized strings', () => {
      const g: any = JSON.parse(JSON.stringify(makeGroup()));
      g.name = 'x'.repeat(10_000);
      expect(() => decodeGroupFromShare(tokenFor(g))).toThrow(ShareDecodeError);
    });

    it('rejects out-of-range currencyDecimals', () => {
      const g: any = JSON.parse(JSON.stringify(makeGroup()));
      g.currencyDecimals = 99;
      expect(() => decodeGroupFromShare(tokenFor(g))).toThrow(ShareDecodeError);
    });

    it('rejects non-finite share.value (Infinity)', () => {
      const g: any = JSON.parse(JSON.stringify(makeGroup()));
      g.expenses[0].shares[0].value = 1e308 * 10;
      expect(() => decodeGroupFromShare(tokenFor(g))).toThrow(ShareDecodeError);
    });
  });

  it('keeps payload reasonable for medium groups', () => {
    const g = makeGroup();
    for (let i = 0; i < 20; i++) {
      g.expenses.push({
        ...g.expenses[0],
        id: `e${i + 10}`,
        title: `Expense ${i}`,
      });
    }
    const { token } = encodeGroupForShare(g);
    expect(token.length).toBeLessThan(6000);
  });
});
