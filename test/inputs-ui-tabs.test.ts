import { describe, it, expect } from 'vitest';
import { tabInputs, groupInputs, DEFAULT_INPUT_TAB, INPUT_DIALOG_GAP_PX, inputDialogBodyStyle } from '../src/renderers/shared/InputsUI';
import type { InputSchema } from '../src/core/model/inputs';

/** A minimal InputSchema with the fields `tabInputs` reads. */
function input(key: string, tab?: string): InputSchema {
    return { key, title: key, type: 'int', defval: 1, ...(tab !== undefined ? { tab } : {}) };
}

describe('tabInputs — settings-dialog tab partition', () => {
    it('puts every input on the default "Inputs" tab when none declares a tab', () => {
        const tabs = tabInputs([input('a'), input('b')]);
        expect(tabs).toHaveLength(1);
        expect(tabs[0]!.name).toBe(DEFAULT_INPUT_TAB);
        expect(tabs[0]!.inputs.map((i) => i.key)).toEqual(['a', 'b']);
    });

    it('leads with the default tab and follows with declared tabs in first-seen order', () => {
        const tabs = tabInputs([
            input('s1', 'Style'),
            input('a'),
            input('v1', 'Visibility'),
            input('s2', 'Style'),
        ]);
        expect(tabs.map((t) => t.name)).toEqual([DEFAULT_INPUT_TAB, 'Style', 'Visibility']);
        expect(tabs[1]!.inputs.map((i) => i.key)).toEqual(['s1', 's2']);
    });

    it('merges an explicit tab="Inputs" with the default tab', () => {
        const tabs = tabInputs([input('a', 'Inputs'), input('b')]);
        expect(tabs).toHaveLength(1);
        expect(tabs[0]!.inputs.map((i) => i.key)).toEqual(['a', 'b']);
    });

    it('treats an empty tab name as unset (default tab)', () => {
        const tabs = tabInputs([input('a', '')]);
        expect(tabs).toHaveLength(1);
        expect(tabs[0]!.name).toBe(DEFAULT_INPUT_TAB);
    });

    it('omits the default tab entirely when every input declares another tab', () => {
        const tabs = tabInputs([input('s1', 'Style'), input('s2', 'Style')]);
        expect(tabs.map((t) => t.name)).toEqual(['Style']);
    });

    it('leaves inputs with group="Style" on the Inputs tab unless explicitly declared with tab', () => {
        const tabs = tabInputs([
            input('len'),
            { key: 'col', title: 'Color', type: 'color', defval: '#ff0000', group: 'Style' },
            input('v1', 'Visibility'),
        ]);
        expect(tabs.map((t) => t.name)).toEqual([DEFAULT_INPUT_TAB, 'Visibility']);
        expect(tabs[0]!.inputs.map((i) => i.key)).toEqual(['len', 'col']);
    });

    it('routes inputs that explicitly declare tab="Style" to the Style tab right after Inputs', () => {
        const tabs = tabInputs([
            input('len'),
            input('col', 'Style'),
            input('v1', 'Visibility'),
        ]);
        expect(tabs.map((t) => t.name)).toEqual([DEFAULT_INPUT_TAB, 'Style', 'Visibility']);
        expect(tabs[1]!.inputs.map((i) => i.key)).toEqual(['col']);
    });
});

describe('groupInputs — settings-dialog section grouping and order', () => {
    it('preserves exact declaration order and does not hoist ungrouped inputs to the top', () => {
        const groups = groupInputs([
            { key: 'g1_a', title: 'G1 A', type: 'int', defval: 1, group: 'First Group' },
            { key: 'ungrouped_1', title: 'U1', type: 'int', defval: 2 },
            { key: 'g2_a', title: 'G2 A', type: 'int', defval: 3, group: 'Second Group' },
            { key: 'ungrouped_2', title: 'U2', type: 'int', defval: 4 },
        ]);

        expect(groups).toHaveLength(4);
        expect(groups[0]!.name).toBe('First Group');
        expect(groups[0]!.rows[0]![0]!.key).toBe('g1_a');

        expect(groups[1]!.name).toBeNull();
        expect(groups[1]!.rows[0]![0]!.key).toBe('ungrouped_1');

        expect(groups[2]!.name).toBe('Second Group');
        expect(groups[2]!.rows[0]![0]!.key).toBe('g2_a');

        expect(groups[3]!.name).toBeNull();
        expect(groups[3]!.rows[0]![0]!.key).toBe('ungrouped_2');
    });

    it('groups consecutive members of the same group together', () => {
        const groups = groupInputs([
            { key: 'a', title: 'A', type: 'int', defval: 1, group: 'Settings' },
            { key: 'b', title: 'B', type: 'int', defval: 2, group: 'Settings' },
            { key: 'c', title: 'C', type: 'int', defval: 3, group: 'Settings' },
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0]!.name).toBe('Settings');
        expect(groups[0]!.rows.map((r) => r[0]!.key)).toEqual(['a', 'b', 'c']);
    });

    it('collapses inputs sharing an inline string onto the same row', () => {
        const groups = groupInputs([
            { key: 'color', title: 'Color', type: 'color', defval: '#ff0000', group: 'Levels', inline: 'row1' },
            { key: 'show', title: 'Show', type: 'bool', defval: true, group: 'Levels', inline: 'row1' },
            { key: 'width', title: 'Width', type: 'int', defval: 2, group: 'Levels' },
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0]!.rows).toHaveLength(2);
        expect(groups[0]!.rows[0]!.map((i) => i.key)).toEqual(['color', 'show']);
        expect(groups[0]!.rows[1]!.map((i) => i.key)).toEqual(['width']);
    });

    it('keeps multiple occurrences of the same group name in sequential order across indicators', () => {
        const groups = groupInputs([
            { key: 'ind1_style', title: 'Color 1', type: 'color', defval: '#111', group: 'Style' },
            { key: 'ind2_main', title: 'Length', type: 'int', defval: 14, group: 'Parameters' },
            { key: 'ind3_style', title: 'Color 3', type: 'color', defval: '#333', group: 'Style' },
        ]);

        expect(groups).toHaveLength(3);
        expect(groups[0]!.name).toBe('Style');
        expect(groups[0]!.rows[0]![0]!.key).toBe('ind1_style');

        expect(groups[1]!.name).toBe('Parameters');
        expect(groups[1]!.rows[0]![0]!.key).toBe('ind2_main');

        expect(groups[2]!.name).toBe('Style');
        expect(groups[2]!.rows[0]![0]!.key).toBe('ind3_style');
    });
});

describe('inputDialogBodyStyle — settings-dialog row rhythm', () => {
    it('packs rows at the start so a flex-grown mobile body keeps the 16px gap', () => {
        const style = inputDialogBodyStyle(true);
        expect(style).toContain('align-content:start');
        expect(style).toContain(`row-gap:${INPUT_DIALOG_GAP_PX}px`);
        expect(style).toContain('flex:1 1 auto');
        expect(style).toContain('grid-template-columns:minmax(0,1fr) auto');
    });

    it('uses the same packed rhythm on desktop (content-sized card, same 16px gap)', () => {
        const style = inputDialogBodyStyle(false);
        expect(style).toContain('align-content:start');
        expect(style).toContain(`row-gap:${INPUT_DIALOG_GAP_PX}px`);
        expect(style).toContain('grid-template-columns:max-content 1fr');
    });
});
