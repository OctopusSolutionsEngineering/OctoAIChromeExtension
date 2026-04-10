'use strict';

global.document = {
    getElementById: jest.fn(() => ({
        addEventListener: jest.fn()
    }))
};

global.window = {
    location: {
        search: '',
        href: 'https://example.test/dashboard'
    }
};

global.dashboardGetConfig = jest.fn();

describe('OSFI dashboard helpers', () => {
    const {
        DEFAULT_REPORTING_PERIOD_DAYS,
        buildOsfiPrompt,
        buildShareUrl,
        isMarkdownTableLine,
        normalizeContextValue,
        normalizeGeneratedMarkdown,
        parseReportingPeriod,
        parseUrlParams
    } = require('./dashboard');

    test('normalizeContextValue returns Not provided for empty or placeholder values', () => {
        expect(normalizeContextValue('')).toBe('Not provided');
        expect(normalizeContextValue('   ')).toBe('Not provided');
        expect(normalizeContextValue('#{Octopus.Space.Name}')).toBe('Not provided');
    });

    test('parseReportingPeriod defaults to configured fallback for invalid values', () => {
        expect(parseReportingPeriod('')).toBe(DEFAULT_REPORTING_PERIOD_DAYS);
        expect(parseReportingPeriod('-3')).toBe(DEFAULT_REPORTING_PERIOD_DAYS);
        expect(parseReportingPeriod('hello')).toBe(DEFAULT_REPORTING_PERIOD_DAYS);
    });

    test('parseReportingPeriod accepts valid positive integers', () => {
        expect(parseReportingPeriod('30')).toBe(30);
        expect(parseReportingPeriod(120)).toBe(120);
    });

    test('buildShareUrl writes space project and days params', () => {
        const url = buildShareUrl('https://example.test/osfi/index.html', {
            space: 'Team Space',
            project: 'Payments API',
            days: '180'
        });

        const parsed = new URL(url);
        expect(parsed.searchParams.get('space')).toBe('Team Space');
        expect(parsed.searchParams.get('project')).toBe('Payments API');
        expect(parsed.searchParams.get('days')).toBe('180');
    });

    test('parseUrlParams returns expected values', () => {
        const params = parseUrlParams('?space=A&project=B&days=45');
        expect(params).toEqual({
            space: 'A',
            project: 'B',
            days: '45'
        });
    });

    test('buildOsfiPrompt includes adapted report requirements', () => {
        const prompt = buildOsfiPrompt({
            spaceName: 'Finance',
            projectName: 'Ledger Service',
            reportingPeriodDays: 30,
            institutionName: 'Demo Bank'
        });

        expect(prompt).toContain('OSFI Compliance Evidence Report for Project "Ledger Service" in Space "Finance"');
        expect(prompt).toContain('B-10 Third-Party Risk Management');
        expect(prompt).toContain('E-21 Operational Resilience');
        expect(prompt).toContain('Insufficient data - recommend manual review');
    });

    test('buildOsfiPrompt does not include MCP tool call instructions', () => {
        const prompt = buildOsfiPrompt({
            spaceName: 'Finance',
            projectName: 'Ledger Service',
            reportingPeriodDays: 90,
            institutionName: 'Demo Bank'
        });

        expect(prompt).not.toContain('list_spaces');
        expect(prompt).not.toContain('get_task_details');
        expect(prompt).not.toContain('get_variables');
        expect(prompt).not.toContain('Write the report to');
    });

    test('isMarkdownTableLine detects markdown table rows', () => {
        expect(isMarkdownTableLine('| Name | Value |')).toBe(true);
        expect(isMarkdownTableLine('|---|---|')).toBe(true);
        expect(isMarkdownTableLine('plain text')).toBe(false);
    });

    test('normalizeGeneratedMarkdown removes blank lines inside markdown tables', () => {
        const input = [
            '## Report Metadata',
            '| Field | Value |',
            '',
            '|---|---|',
            '',
            '| Institution | Demo Bank |',
            '',
            '| Report Date | 2026-04-10 |'
        ].join('\n');

        const output = normalizeGeneratedMarkdown(input);

        expect(output).toContain('| Field | Value |\n|---|---|\n| Institution | Demo Bank |\n| Report Date | 2026-04-10 |');
    });
});
