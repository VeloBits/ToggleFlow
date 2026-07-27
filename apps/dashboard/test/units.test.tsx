// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

import type { FlagRow } from '../src/api/client';
import { diffLines } from '../src/components/diff';
import { ConfirmButton, StatusChip } from '../src/components/ui';
import { EMPTY_FILTER, filterRows } from '../src/pages/tools-filter';

describe('diffLines', () => {
  it('marks added, removed, and unchanged lines', () => {
    const before = '{\n  "limit": 5,\n  "mode": "a"\n}';
    const after = '{\n  "limit": 9,\n  "mode": "a"\n}';
    const diff = diffLines(before, after);
    expect(diff.filter((l) => l.kind === 'removed').map((l) => l.text)).toEqual(['  "limit": 5,']);
    expect(diff.filter((l) => l.kind === 'added').map((l) => l.text)).toEqual(['  "limit": 9,']);
    expect(diff.filter((l) => l.kind === 'same')).toHaveLength(3);
  });

  it('handles pure additions and identical inputs', () => {
    expect(diffLines('a', 'a').every((l) => l.kind === 'same')).toBe(true);
    expect(diffLines('a', 'a\nb').filter((l) => l.kind === 'added')).toHaveLength(1);
  });
});

describe('filterRows', () => {
  const row = (over: Partial<FlagRow & { tags: string[] }>): FlagRow & { tags: string[] } => ({
    toolId: 't',
    toolKey: 'tool.x',
    toolName: 'X',
    archived: false,
    enabled: true,
    rolloutPercent: null,
    targetingRules: [],
    updatedAt: '2026-01-01T00:00:00Z',
    tags: [],
    ...over,
  });
  const rows = [
    row({ toolId: '1', toolKey: 'tool.summarize', toolName: 'Summarize', tags: ['ai'] }),
    row({ toolId: '2', toolKey: 'tool.translate', toolName: 'Translate', enabled: false }),
    row({ toolId: '3', toolKey: 'tool.rollout', toolName: 'Rollout', rolloutPercent: 25 }),
    row({ toolId: '4', toolKey: 'tool.old', toolName: 'Old', archived: true }),
  ];

  it('hides archived by default and finds by key or name', () => {
    expect(filterRows(rows, EMPTY_FILTER)).toHaveLength(3);
    expect(filterRows(rows, { ...EMPTY_FILTER, includeArchived: true })).toHaveLength(4);
    expect(filterRows(rows, { ...EMPTY_FILTER, search: 'SUMM' })).toHaveLength(1);
    expect(filterRows(rows, { ...EMPTY_FILTER, search: 'translate' })[0]!.toolId).toBe('2');
  });

  it('filters by status and tag', () => {
    expect(filterRows(rows, { ...EMPTY_FILTER, status: 'on' }).map((r) => r.toolId)).toEqual(['1']);
    expect(filterRows(rows, { ...EMPTY_FILTER, status: 'off' }).map((r) => r.toolId)).toEqual([
      '2',
    ]);
    expect(filterRows(rows, { ...EMPTY_FILTER, status: 'rollout' }).map((r) => r.toolId)).toEqual([
      '3',
    ]);
    expect(filterRows(rows, { ...EMPTY_FILTER, tag: 'ai' }).map((r) => r.toolId)).toEqual(['1']);
  });
});

describe('StatusChip', () => {
  it('renders ON / OFF / percentage', () => {
    const { rerender } = render(<StatusChip enabled={true} rolloutPercent={null} />);
    expect(screen.getByText('ON')).toBeTruthy();
    rerender(<StatusChip enabled={false} rolloutPercent={null} />);
    expect(screen.getByText('OFF')).toBeTruthy();
    rerender(<StatusChip enabled={true} rolloutPercent={25} />);
    expect(screen.getByText('25%')).toBeTruthy();
  });
});

describe('ConfirmButton', () => {
  it('requires a second click when confirmation is on', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton label="Turn OFF" confirmLabel="Sure?" onConfirm={onConfirm} requireConfirm />,
    );
    fireEvent.click(screen.getByText('Turn OFF'));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Sure?'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('fires immediately when confirmation is off (non-prod)', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton
        label="Turn OFF"
        confirmLabel="Sure?"
        onConfirm={onConfirm}
        requireConfirm={false}
      />,
    );
    fireEvent.click(screen.getByText('Turn OFF'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
