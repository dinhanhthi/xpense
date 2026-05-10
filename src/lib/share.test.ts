import { describe, it, expect } from 'vitest';
import LZString from 'lz-string';
import { encodeGroupForShare, decodeGroupFromShare, ShareDecodeError, SHARE_VERSION } from './share';
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

describe('share encode/decode (v2 compact)', () => {
  it('uses v2 format by default', () => {
    expect(SHARE_VERSION).toBe(2);
    const { token } = encodeGroupForShare(makeGroup());
    const raw = LZString.decompressFromEncodedURIComponent(token);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toBe(2);
  });

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
    expect(restored.currencyDecimals).toBe(original.currencyDecimals);
    expect(restored.members.map((m) => m.name)).toEqual(original.members.map((m) => m.name));
    expect(restored.members.map((m) => m.color)).toEqual(original.members.map((m) => m.color));
    expect(restored.expenses[0].title).toBe(original.expenses[0].title);
    expect(restored.expenses[0].amountMinor).toBe(original.expenses[0].amountMinor);
    expect(restored.expenses[0].splitMode).toBe(original.expenses[0].splitMode);
    expect(restored.expenses[0].date).toBe(original.expenses[0].date);

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

  it('round-trip preserves percent split values', () => {
    const g = makeGroup();
    g.expenses[0].splitMode = 'percent';
    g.expenses[0].shares = [
      { memberId: 'm1', value: 60 },
      { memberId: 'm2', value: 40 },
    ];
    const { token } = encodeGroupForShare(g);
    const { group: restored } = decodeGroupFromShare(token);
    expect(restored.expenses[0].splitMode).toBe('percent');
    expect(restored.expenses[0].shares.map((s) => s.value).sort()).toEqual([40, 60]);
  });

  it('round-trip preserves note when present', () => {
    const g = makeGroup();
    g.expenses[0].note = 'Tip included';
    const { token } = encodeGroupForShare(g);
    const { group: restored } = decodeGroupFromShare(token);
    expect(restored.expenses[0].note).toBe('Tip included');
  });

  it('omits note from payload when not provided', () => {
    const { token } = encodeGroupForShare(makeGroup());
    const { group: restored } = decodeGroupFromShare(token);
    expect(restored.expenses[0].note).toBeUndefined();
  });

  it('rejects corrupted token', () => {
    expect(() => decodeGroupFromShare('!!!not-a-real-token!!!')).toThrow(ShareDecodeError);
  });

  it('rejects unsupported version (v99 tuple)', () => {
    const tokenBad = LZString.compressToEncodedURIComponent(
      JSON.stringify([99, 'name', 'EUR', 2, 0, 0, [], []]),
    );
    expect(() => decodeGroupFromShare(tokenBad)).toThrow(ShareDecodeError);
  });

  describe('rejects malicious v2 payloads', () => {
    function tokenFor(payload: unknown): string {
      return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
    }

    it('rejects too many members', () => {
      const members = Array.from({ length: 10_000 }, () => ['x']);
      const payload = [2, 'g', 'EUR', 2, 0, 0, members, []];
      expect(() => decodeGroupFromShare(tokenFor(payload))).toThrow(ShareDecodeError);
    });

    it('rejects too many expenses', () => {
      const expenses = Array.from({ length: 6000 }, () => ['x', 100, 0, '2026-01-01', 0]);
      const payload = [2, 'g', 'EUR', 2, 0, 0, [['Alice']], expenses];
      expect(() => decodeGroupFromShare(tokenFor(payload))).toThrow(ShareDecodeError);
    });

    it('rejects unknown splitMode code', () => {
      const payload = [2, 'g', 'EUR', 2, 0, 0, [['Alice']], [['x', 100, 0, '2026-01-01', 99]]];
      expect(() => decodeGroupFromShare(tokenFor(payload))).toThrow(ShareDecodeError);
    });

    it('rejects non-integer amountMinor', () => {
      const payload = [2, 'g', 'EUR', 2, 0, 0, [['Alice']], [['x', 'huge', 0, '2026-01-01', 0]]];
      expect(() => decodeGroupFromShare(tokenFor(payload))).toThrow(ShareDecodeError);
    });

    it('rejects unknown currency code', () => {
      const payload = [2, 'g', 'XXX', 2, 0, 0, [['Alice']], []];
      expect(() => decodeGroupFromShare(tokenFor(payload))).toThrow(ShareDecodeError);
    });

    it('rejects payer index out of range', () => {
      const payload = [2, 'g', 'EUR', 2, 0, 0, [['Alice']], [['x', 100, 5, '2026-01-01', 0]]];
      expect(() => decodeGroupFromShare(tokenFor(payload))).toThrow(ShareDecodeError);
    });

    it('rejects share member index out of range', () => {
      const payload = [
        2,
        'g',
        'EUR',
        2,
        0,
        0,
        [['Alice']],
        [['x', 100, 0, '2026-01-01', 1, [[5, 50]]]],
      ];
      expect(() => decodeGroupFromShare(tokenFor(payload))).toThrow(ShareDecodeError);
    });

    it('rejects non-hex member.color', () => {
      const payload = [2, 'g', 'EUR', 2, 0, 0, [['Alice', 'red; foo: bar']], []];
      expect(() => decodeGroupFromShare(tokenFor(payload))).toThrow(ShareDecodeError);
    });

    it('rejects oversized strings', () => {
      const payload = [2, 'x'.repeat(10_000), 'EUR', 2, 0, 0, [['Alice']], []];
      expect(() => decodeGroupFromShare(tokenFor(payload))).toThrow(ShareDecodeError);
    });

    it('rejects out-of-range currencyDecimals', () => {
      const payload = [2, 'g', 'EUR', 99, 0, 0, [['Alice']], []];
      expect(() => decodeGroupFromShare(tokenFor(payload))).toThrow(ShareDecodeError);
    });

    it('rejects non-finite share value (Infinity)', () => {
      const payload = [
        2,
        'g',
        'EUR',
        2,
        0,
        0,
        [['Alice']],
        [['x', 100, 0, '2026-01-01', 1, [[0, 1e308 * 10]]]],
      ];
      expect(() => decodeGroupFromShare(tokenFor(payload))).toThrow(ShareDecodeError);
    });
  });

  describe('legacy v1 backwards compat', () => {
    it('still decodes v1 payloads', () => {
      const payload = { v: 1, group: makeGroup() };
      const token = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
      const { group, version } = decodeGroupFromShare(token);
      expect(version).toBe(1);
      expect(group.name).toBe('Trip to Lisbon');
      expect(group.expenses[0].title).toBe('Dinner');
    });

    it('rejects v99 in legacy format', () => {
      const payload = { v: 99, group: makeGroup() };
      const token = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
      expect(() => decodeGroupFromShare(token)).toThrow(ShareDecodeError);
    });
  });

  it('v2 payload is significantly smaller than v1 for the same group', () => {
    const g = makeGroup();
    for (let i = 0; i < 10; i++) {
      g.expenses.push({
        ...g.expenses[0],
        id: `e${i + 10}`,
        title: `Expense ${i}`,
      });
    }
    const { token: tokenV2 } = encodeGroupForShare(g);
    const v1Payload = { v: 1, group: { ...g, expenses: g.expenses.map((e) => ({ ...e, imageIds: [] })) } };
    const tokenV1 = LZString.compressToEncodedURIComponent(JSON.stringify(v1Payload));
    // v2 should be at least 30% shorter
    expect(tokenV2.length).toBeLessThan(tokenV1.length * 0.7);
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
    expect(token.length).toBeLessThan(4000);
  });
});
