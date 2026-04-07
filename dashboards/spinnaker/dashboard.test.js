'use strict';

// Minimal browser-global stubs so that dashboard.js can be require()'d in Node.js.
// Only document.addEventListener is called at module load time; everything else
// is referenced only inside event handlers and is not needed for unit tests.
global.document = { addEventListener: jest.fn() };
global.window   = { crypto: { getRandomValues: (arr) => { arr.fill(0xab); return arr; } } };
global.localStorage         = { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() };
global.dashboardGetConfig   = jest.fn();
global.dashboardSendPrompt  = jest.fn();
global.dashboardApprovePrompt = jest.fn();

const { splitPrompts, SECTION_SEPARATOR } = require('./dashboard');

const SEP = SECTION_SEPARATOR; // '\n\n---\n\n'

describe('splitPrompts', () => {
    test('returns a single element when there is no separator', () => {
        expect(splitPrompts('hello world')).toEqual(['hello world']);
    });

    test('returns a single empty-string element for an empty input', () => {
        expect(splitPrompts('')).toEqual(['']);
    });

    test('splits on SECTION_SEPARATOR into two sections', () => {
        expect(splitPrompts(`section one${SEP}section two`))
            .toEqual(['section one', 'section two']);
    });

    test('splits on SECTION_SEPARATOR into three sections', () => {
        expect(splitPrompts(`a${SEP}b${SEP}c`)).toEqual(['a', 'b', 'c']);
    });

    test('does not split on --- inside a backtick code block', () => {
        const input = `before\n\`\`\`\nsome code\n\n---\n\nmore code\n\`\`\`\nafter`;
        expect(splitPrompts(input)).toEqual([input]);
    });

    test('does not split on --- inside a fenced code block with a language tag', () => {
        const input = `text\n\`\`\`yaml\nfoo: bar\n\n---\n\nbaz: qux\n\`\`\`\ntext`;
        expect(splitPrompts(input)).toEqual([input]);
    });

    test('does not split on --- inside a tilde fenced code block', () => {
        const input = `before\n~~~\nsome code\n\n---\n\nmore code\n~~~\nafter`;
        expect(splitPrompts(input)).toEqual([input]);
    });

    test('splits on separators outside a code block but not on one inside', () => {
        const s1    = 'section one';
        const block = '```\ncode\n\n---\n\nmore code\n```';
        const s2    = 'section two';
        expect(splitPrompts(`${s1}${SEP}${block}${SEP}${s2}`))
            .toEqual([s1, block, s2]);
    });

    test('preserves --- in a code block when an outside separator causes a split', () => {
        const block = '```\n---\n```';
        expect(splitPrompts(`intro${SEP}${block}`)).toEqual(['intro', block]);
    });

    test('handles text that is only a SECTION_SEPARATOR (produces two empty sections)', () => {
        expect(splitPrompts(SEP)).toEqual(['', '']);
    });
});

