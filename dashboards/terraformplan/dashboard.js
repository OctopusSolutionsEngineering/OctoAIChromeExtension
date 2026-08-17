'use strict';

/* ==========================================================================
   Terraform Plan Viewer
   Renders Terraform/OpenTofu plan output from Octopus task logs as a
   structured, readable diff. Read-only: only GET requests are made against
   the Octopus API, polling the same task-details endpoint the portal uses.
   ========================================================================== */

const STORAGE_PREFIX = 'terraformplan.';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_FAILURES = 3;
const REQUEST_TIMEOUT_MS = 15000;
const CONFIG_TIMEOUT_MS = 2500;
const AI_PLAN_CHAR_LIMIT = 6000;
const DEFAULT_OPEN_THRESHOLD = 8;
const HISTORY_PAGE_SIZE = 30;
const RELEASE_LOOKUP_SIZE = 100;
const MI_INSTRUCTIONS_CHAR_LIMIT = 400;
// API access is rate limited to 200 requests/minute via pThrottle (bundled in
// ../api.js), and 429 responses are retried after the server-suggested delay.
const RATE_LIMIT_PER_MINUTE = 200;
const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 2000;

/* ==========================================================================
   Text utilities
   ========================================================================== */

// Remove ANSI colour/control escape sequences.
function stripAnsi(text) {
    // eslint-disable-next-line no-control-regex
    return String(text).replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
}

// Remove the "10:23:45   Info     |" prefix from raw Octopus task log lines.
function stripLogPrefix(line) {
    return String(line).replace(/^\d{2}:\d{2}:\d{2}\s+(?:Verbose|Info|Warning|Error|Fatal)\s*\|\s?/, '');
}

// Normalise a blob of log text into clean plan lines.
function normalizePlanText(raw) {
    return stripAnsi(String(raw ?? ''))
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map(stripLogPrefix)
        .map(line => line.replace(/\s+$/, ''));
}

/* ==========================================================================
   Plan parser
   ========================================================================== */

const HEADER_PATTERNS = [
    { re: /^\s*# (.+?) will be created$/, action: 'create' },
    { re: /^\s*# (.+?) will be updated in-place$/, action: 'update' },
    { re: /^\s*# (.+?) will be destroyed$/, action: 'destroy' },
    { re: /^\s*# (.+?) is tainted, so it must be replaced$/, action: 'replace' },
    { re: /^\s*# (.+?) must be replaced$/, action: 'replace' },
    { re: /^\s*# (.+?) will be replaced$/, action: 'replace' },
    { re: /^\s*# (.+?) will be read during apply$/, action: 'read' },
    { re: /^\s*# (.+?) will be imported$/, action: 'import' },
];

const ACTION_LABELS = {
    create: '+ create',
    update: '~ update',
    destroy: '- destroy',
    replace: '± replace',
    read: '<= read',
    import: '» import',
};

function matchResourceHeader(line) {
    for (const pattern of HEADER_PATTERNS) {
        const match = line.match(pattern.re);
        if (match) {
            return { address: match[1], action: pattern.action };
        }
    }
    return null;
}

// Classify a single plan body line for colouring.
function classifyLine(line) {
    const trimmed = String(line).trimStart();
    if (trimmed.startsWith('-/+') || trimmed.startsWith('+/-')) return 'replace';
    if (trimmed.startsWith('<=')) return 'read';
    if (trimmed.startsWith('# ') || trimmed === '#') return 'comment';
    if (trimmed.startsWith('+ ')) return 'add';
    if (trimmed.startsWith('- ')) return 'remove';
    if (trimmed.startsWith('~ ')) return 'change';
    return 'context';
}

const OUTPUT_LINE_RE = /^\s*([+~-])\s+([A-Za-z0-9_"[\]().\-]+)\s*=\s*(.*)$/;
const SEPARATOR_RE = /^[-─═―_]{5,}$/;

function parsePlan(rawText) {
    const lines = normalizePlanText(rawText);
    const text = lines.join('\n');

    const resources = [];
    const outputs = [];
    const warnings = [];

    let current = null;
    let inOutputs = false;
    let currentWarning = null;
    let warningBlankRun = 0;

    const flush = () => {
        if (!current) return;
        while (current.lines.length && current.lines[current.lines.length - 1] === '') {
            current.lines.pop();
        }
        current.forcesReplacement = current.lines.some(l => l.includes('# forces replacement'));
        resources.push(current);
        current = null;
    };

    const flushWarning = () => {
        if (!currentWarning) return;
        while (currentWarning.lines.length && currentWarning.lines[currentWarning.lines.length - 1] === '') {
            currentWarning.lines.pop();
        }
        warnings.push(currentWarning);
        currentWarning = null;
        warningBlankRun = 0;
    };

    for (const line of lines) {
        const header = matchResourceHeader(line);
        const warningStart = line.match(/^(Warning|Error):\s*(.*)$/);
        const isPlanLine = /^Plan:/.test(line);
        const isOutputsStart = /^Changes to Outputs:/.test(line);

        if (header) {
            flush();
            flushWarning();
            inOutputs = false;
            current = { address: header.address, action: header.action, reason: null, lines: [line], forcesReplacement: false };
            continue;
        }

        if (isPlanLine || isOutputsStart || SEPARATOR_RE.test(line.trim())) {
            flush();
            flushWarning();
            inOutputs = isOutputsStart;
            continue;
        }

        if (warningStart) {
            flush();
            flushWarning();
            inOutputs = false;
            currentWarning = { severity: warningStart[1].toLowerCase(), title: warningStart[2] || warningStart[1], lines: [] };
            continue;
        }

        if (currentWarning) {
            if (line.trim() === '') {
                warningBlankRun += 1;
                if (warningBlankRun >= 2) {
                    flushWarning();
                } else {
                    currentWarning.lines.push(line);
                }
            } else {
                warningBlankRun = 0;
                currentWarning.lines.push(line);
            }
            continue;
        }

        if (inOutputs) {
            const outputMatch = line.match(OUTPUT_LINE_RE);
            if (outputMatch) {
                outputs.push({ symbol: outputMatch[1], name: outputMatch[2], value: outputMatch[3] });
                continue;
            }
            if (line.trim() === '') continue;
            inOutputs = false;
            // fall through so the line is considered by the handlers below
        }

        if (current) {
            // A "# (because ...)" comment immediately after the header is the reason
            const reasonMatch = line.match(/^\s*# \((.+)\)$/);
            if (reasonMatch && current.lines.length === 1 && current.reason === null) {
                current.reason = reasonMatch[1];
                continue;
            }
            current.lines.push(line);
        }
    }

    flush();
    flushWarning();

    // Global markers
    const planLineMatch = text.match(/^Plan:.*$/m);
    const addMatch = text.match(/(\d+) to add/);
    const changeMatch = text.match(/(\d+) to change/);
    const destroyMatch = text.match(/(\d+) to destroy/);
    const importMatch = text.match(/(\d+) to import/);
    const noChangesMatch = text.match(/^No changes\..*$/m);
    const drift = /Objects have changed outside of Terraform/i.test(text)
        || /Note: Objects have changed outside of/i.test(text);
    const hasPlanMarker = /(Terraform|OpenTofu) will perform the following actions/i.test(text)
        || /(Terraform|OpenTofu) used the selected providers/i.test(text);

    const summary = {
        line: planLineMatch ? planLineMatch[0] : null,
        add: addMatch ? parseInt(addMatch[1], 10) : null,
        change: changeMatch ? parseInt(changeMatch[1], 10) : null,
        destroy: destroyMatch ? parseInt(destroyMatch[1], 10) : null,
        imports: importMatch ? parseInt(importMatch[1], 10) : null,
    };

    const noChanges = noChangesMatch ? noChangesMatch[0] : null;
    const planFound = resources.length > 0 || summary.line !== null || noChanges !== null;

    return { resources, outputs, warnings, summary, noChanges, drift, hasPlanMarker, planFound, cleanText: text };
}

// Which resource actions each filter key shows. The tile-* filters mirror the
// numbers on the "Plan:" line, where a replacement counts as both an add and
// a destroy - so clicking "3 to add" really shows 3 resources.
const FILTER_ACTIONS = {
    'tile-add': ['create', 'replace'],
    'tile-change': ['update'],
    'tile-destroy': ['destroy', 'replace'],
};

function filterMatches(action, filterKey) {
    if (filterKey === 'all') return true;
    const actions = FILTER_ACTIONS[filterKey] || [filterKey];
    return actions.includes(action);
}

// Counts used for the stat tiles and filter chips. Prefers the numbers from
// the "Plan:" summary line; falls back to counting parsed resource blocks
// (useful mid-stream, before the summary line has been logged).
function computeCounts(parsed) {
    const byAction = { create: 0, update: 0, destroy: 0, replace: 0, read: 0, import: 0 };
    for (const resource of parsed.resources) {
        if (byAction[resource.action] !== undefined) byAction[resource.action] += 1;
    }

    const summary = parsed.summary;
    return {
        add: summary.add !== null ? summary.add : byAction.create + byAction.replace,
        change: summary.change !== null ? summary.change : byAction.update,
        destroy: summary.destroy !== null ? summary.destroy : byAction.destroy + byAction.replace,
        imports: summary.imports !== null ? summary.imports : byAction.import,
        replace: byAction.replace,
        byAction,
    };
}

/* ==========================================================================
   Octopus task-details helpers
   ========================================================================== */

function collectLogText(node, out) {
    if (!node) return out;
    for (const element of node.LogElements || []) {
        out.push(element.MessageText || '');
    }
    for (const child of node.Children || []) {
        collectLogText(child, out);
    }
    return out;
}

// Find all activity nodes that look like Terraform/OpenTofu plan steps,
// best match first. More than one candidate is common in real processes
// (e.g. a plan step followed by an apply step, or multiple stacks).
function pickTerraformSteps(activityLogs) {
    const candidates = [];

    for (const root of activityLogs || []) {
        for (const step of root.Children || []) {
            const textLines = collectLogText(step, []);
            const stepText = textLines.join('\n');
            let score = 0;
            const name = step.Name || '';

            if (/terraform|tofu/i.test(name)) score += 2;
            if (/plan/i.test(name)) score += 1;
            if (/will perform the following actions/i.test(stepText)) score += 3;
            if (/^Plan:/m.test(stepText)) score += 2;
            if (/No changes\./.test(stepText)) score += 1;
            if (/terraform|tofu/i.test(stepText)) score += 1;

            if (score > 0) {
                candidates.push({ name, text: stepText, score });
            }
        }
    }

    // Stable sort: equal scores keep process order
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
}

function pickTerraformStep(activityLogs) {
    const candidates = pickTerraformSteps(activityLogs);
    return candidates.length ? candidates[0] : null;
}

/* ==========================================================================
   Deployment history helpers
   ========================================================================== */

// [{Id, Name}] -> {Id: Name}
function buildNameMap(items) {
    const map = {};
    for (const item of items || []) {
        if (item && item.Id) map[item.Id] = item.Name || item.Id;
    }
    return map;
}

// [{Id, Version}] -> {Id: Version}
function buildVersionMap(releases) {
    const map = {};
    for (const release of releases || []) {
        if (release && release.Id) map[release.Id] = release.Version || null;
    }
    return map;
}

// [{Id, State, HasPendingInterruptions}] -> {Id: {state, awaitingIntervention}}
function buildTaskMap(tasks) {
    const map = {};
    for (const task of tasks || []) {
        if (task && task.Id) {
            map[task.Id] = {
                state: task.State || null,
                awaitingIntervention: !!task.HasPendingInterruptions,
            };
        }
    }
    return map;
}

// Flatten one deployment plus the lookup maps into a display row.
function describeDeployment(deployment, lookups) {
    const versions = (lookups && lookups.versions) || {};
    const environments = (lookups && lookups.environments) || {};
    const tasks = (lookups && lookups.tasks) || {};
    const task = deployment.TaskId ? tasks[deployment.TaskId] : undefined;

    return {
        deploymentId: deployment.Id,
        taskId: deployment.TaskId || null,
        name: deployment.Name || deployment.Id,
        version: versions[deployment.ReleaseId] || null,
        environmentName: environments[deployment.EnvironmentId] || deployment.EnvironmentId || '',
        created: deployment.Created || null,
        state: task ? task.state : null,
        awaitingIntervention: !!(task && task.awaitingIntervention),
    };
}

// Client-side date-range filter for loaded history rows. from/to are
// yyyy-mm-dd strings from <input type="date">; either may be empty. The "to"
// day is inclusive.
function filterRowsByDate(rows, from, to) {
    const fromMs = from ? Date.parse(from + 'T00:00:00') : null;
    const toMs = to ? Date.parse(to + 'T00:00:00') + 24 * 60 * 60 * 1000 : null;

    return (rows || []).filter(row => {
        if (!row.created) return true;
        const created = Date.parse(row.created);
        if (!Number.isFinite(created)) return true;
        if (fromMs !== null && Number.isFinite(fromMs) && created < fromMs) return false;
        if (toMs !== null && Number.isFinite(toMs) && created >= toMs) return false;
        return true;
    });
}

// Human-friendly age of an ISO timestamp relative to nowMs.
function relativeAge(iso, nowMs) {
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) return '';
    const minutes = Math.floor(Math.max(0, nowMs - then) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes + ' min ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    const days = Math.floor(hours / 24);
    if (days < 30) return days + (days === 1 ? ' day ago' : ' days ago');
    const months = Math.floor(days / 30);
    if (months < 12) return months + (months === 1 ? ' month ago' : ' months ago');
    const years = Math.floor(days / 365);
    return years + (years === 1 ? ' year ago' : ' years ago');
}

/* ==========================================================================
   Manual intervention helpers
   ========================================================================== */

// Summarise the first pending interruption from /api/{space}/interruptions.
// The intervention instructions arrive as Paragraph controls in the Form.
function extractPendingInterruption(items) {
    const pending = (items || []).find(item => item && item.IsPending !== false);
    if (!pending) return null;

    const paragraphs = [];
    const elements = (pending.Form && pending.Form.Elements) || [];
    for (const element of elements) {
        const control = element && element.Control;
        if (control && control.Type === 'Paragraph' && control.Text) {
            paragraphs.push(control.Text);
        }
    }

    return {
        id: pending.Id || null,
        title: pending.Title || 'Manual intervention',
        instructions: paragraphs.join('\n\n'),
    };
}

/* ==========================================================================
   Minimal Markdown support
   The AI Assistant and manual intervention instructions both return Markdown.
   This is a deliberately small, safe subset: parsing produces plain data and
   rendering builds DOM nodes via textContent only - no innerHTML.
   ========================================================================== */

// Split a line of text into inline segments:
// [{type: 'text'|'code'|'bold'|'italic', text}]
function parseInline(text) {
    const segments = [];

    const pushStyled = chunk => {
        // **bold** first, then *italic* within the remaining plain text
        const boldParts = chunk.split(/\*\*([^*]+)\*\*/g);
        boldParts.forEach((part, index) => {
            if (index % 2 === 1) {
                segments.push({ type: 'bold', text: part });
                return;
            }
            const italicParts = part.split(/\*([^*]+)\*/g);
            italicParts.forEach((sub, subIndex) => {
                if (!sub) return;
                segments.push({ type: subIndex % 2 === 1 ? 'italic' : 'text', text: sub });
            });
        });
    };

    // `code` spans win over styling; an unpaired trailing backtick is literal
    const codeParts = String(text ?? '').split('`');
    codeParts.forEach((part, index) => {
        if (index % 2 === 1 && index < codeParts.length - (codeParts.length % 2 === 0 ? 1 : 0)) {
            if (part) segments.push({ type: 'code', text: part });
        } else if (part) {
            pushStyled(part);
        }
    });

    return segments;
}

// Group Markdown text into blocks:
// [{type:'heading', text} | {type:'paragraph', text} | {type:'list', ordered, items:[text]}]
function parseMarkdownBlocks(markdown) {
    const blocks = [];
    let paragraph = [];
    let list = null;

    const flushParagraph = () => {
        if (paragraph.length) {
            blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
            paragraph = [];
        }
    };
    const flushList = () => {
        if (list) {
            blocks.push(list);
            list = null;
        }
    };

    const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
            flushParagraph();
            flushList();
            continue;
        }

        const heading = trimmed.match(/^#{1,4}\s+(.*)$/);
        if (heading) {
            flushParagraph();
            flushList();
            blocks.push({ type: 'heading', text: heading[1] });
            continue;
        }

        const unordered = trimmed.match(/^[-*•]\s+(.*)$/);
        const ordered = trimmed.match(/^\d+[.)]\s+(.*)$/);
        if (unordered || ordered) {
            flushParagraph();
            const isOrdered = !!ordered;
            if (!list || list.ordered !== isOrdered) {
                flushList();
                list = { type: 'list', ordered: isOrdered, items: [] };
            }
            list.items.push((unordered || ordered)[1]);
            continue;
        }

        if (list) {
            // Wrapped continuation of the previous list item
            list.items[list.items.length - 1] += ' ' + trimmed;
            continue;
        }

        paragraph.push(trimmed);
    }

    flushParagraph();
    flushList();
    return blocks;
}

function appendInline(node, text) {
    for (const segment of parseInline(text)) {
        if (segment.type === 'code') {
            node.appendChild(el('code', 'md-code', segment.text));
        } else if (segment.type === 'bold') {
            node.appendChild(el('strong', null, segment.text));
        } else if (segment.type === 'italic') {
            node.appendChild(el('em', null, segment.text));
        } else {
            node.appendChild(document.createTextNode(segment.text));
        }
    }
}

function renderMarkdownInto(container, markdown) {
    container.replaceChildren();
    for (const block of parseMarkdownBlocks(markdown)) {
        if (block.type === 'heading') {
            const heading = el('div', 'md-heading');
            appendInline(heading, block.text);
            container.appendChild(heading);
        } else if (block.type === 'list') {
            const listEl = el(block.ordered ? 'ol' : 'ul', 'md-list');
            for (const item of block.items) {
                const li = el('li');
                appendInline(li, item);
                listEl.appendChild(li);
            }
            container.appendChild(listEl);
        } else {
            const p = el('p', 'md-p');
            appendInline(p, block.text);
            container.appendChild(p);
        }
    }
}

/* ==========================================================================
   AI prompt
   ========================================================================== */

function buildAiPrompt(parsed, context) {
    const counts = computeCounts(parsed);
    const summaryLine = parsed.summary.line || (parsed.noChanges ? parsed.noChanges : 'No summary line yet.');
    const planText = parsed.cleanText.length > AI_PLAN_CHAR_LIMIT
        ? parsed.cleanText.slice(0, AI_PLAN_CHAR_LIMIT) + '\n... (truncated)'
        : parsed.cleanText;

    const contextParts = [];
    if (context && context.space) contextParts.push('The current space is "' + context.space + '".');
    if (context && context.project) contextParts.push('The current project is "' + context.project + '".');

    return [
        'You are helping a change approver review a Terraform plan produced by an Octopus deployment.',
        'Summarize the plan below in under 200 words:',
        '1. Start with a one sentence overview of the scale and blast radius of the change.',
        '2. Call out destructive actions (destroy or replace) first, naming the resource addresses and why they are destructive.',
        '3. Note likely cost or availability impacts if any are evident.',
        '4. Finish with anything the approver should verify before approving.',
        'Plan summary: ' + summaryLine + ' (' + counts.replace + ' replacement(s) detected).',
        contextParts.join(' '),
        'Terraform plan output:',
        '```',
        planText,
        '```',
    ].filter(Boolean).join('\n');
}

/* ==========================================================================
   Everything below here touches the DOM and only runs in the browser.
   ========================================================================== */

const state = {
    mode: null,             // 'live' | 'history' | 'paste'
    extensionMode: false,
    config: null,
    serverUrl: null,
    spaceId: null,
    taskId: null,
    task: null,
    stepName: null,
    stepCandidates: [],
    activeStepName: null,
    parsed: null,
    view: 'pretty',
    filter: 'all',
    search: '',
    openMap: {},
    pollTimer: null,
    pollFailures: 0,
    polling: false,
    aiBusy: false,
    warningsOpen: false,
    taskDetailOpen: false,
    interruption: null,     // {taskId, title, instructions} for the MI banner
    history: {
        spaces: [],         // [{Id, Name}], cached per server
        projects: [],
        environments: null, // {EnvironmentId: Name}, cached per space
        environmentList: [],
        rows: [],           // accumulated across "Load more" pages
        totalResults: 0,
        selectedDeploymentId: null,
        loading: false,
    },
};

function resetHistoryCache(keepSpaces) {
    state.history = {
        spaces: keepSpaces ? state.history.spaces : [],
        projects: [],
        environments: null,
        environmentList: [],
        rows: [],
        totalResults: 0,
        selectedDeploymentId: null,
        loading: false,
    };
}

function byId(id) {
    return document.getElementById(id);
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
}

function storageGet(key, fallback) {
    try {
        const value = localStorage.getItem(STORAGE_PREFIX + key);
        return value === null ? fallback : value;
    } catch (e) {
        return fallback;
    }
}

function storageSet(key, value) {
    try {
        localStorage.setItem(STORAGE_PREFIX + key, value);
    } catch (e) {
        // Storage unavailable - non-fatal
    }
}

/* ---------- inline SVG icons ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';

// Stroke-based 24x24 icon paths (feather-style)
const ICON_PATHS = {
    add: ['M12 5v14', 'M5 12h14'],
    change: ['M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'],
    destroy: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6', 'M10 11v6', 'M14 11v6'],
    replace: ['M23 4v6h-6', 'M20.49 15a9 9 0 1 1-2.12-9.36L23 10'],
    import: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 21h16'],
};

function svgIcon(kind) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    for (const d of ICON_PATHS[kind] || []) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
    }
    return svg;
}

/* ---------- extension config ---------- */

// Resolves the extension dashboard config, or null when running outside the
// extension (e.g. opened directly in a browser tab for development).
function getExtensionConfig(timeoutMs) {
    return new Promise(resolve => {
        let settled = false;
        const finish = value => {
            if (!settled) {
                settled = true;
                resolve(value);
            }
        };
        const timer = setTimeout(() => finish(null), timeoutMs || CONFIG_TIMEOUT_MS);
        try {
            if (typeof dashboardGetConfig !== 'function') {
                clearTimeout(timer);
                finish(null);
                return;
            }
            dashboardGetConfig(config => {
                clearTimeout(timer);
                finish(config || null);
            });
        } catch (e) {
            clearTimeout(timer);
            finish(null);
        }
    });
}

/* ---------- API client (read-only) ---------- */

class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.retryAfterMs = null;
    }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// All API calls go through pThrottle (from ../api.js), capping this dashboard
// at 200 requests per minute. Created lazily so the module also loads outside
// the browser (unit tests).
let throttledOctoGetOnce = null;

function getThrottledOctoGetOnce() {
    if (!throttledOctoGetOnce) {
        const throttle = pThrottle({ limit: RATE_LIMIT_PER_MINUTE, interval: 60000 });
        throttledOctoGetOnce = throttle(octoGetOnce);
    }
    return throttledOctoGetOnce;
}

async function octoGetOnce(serverUrl, path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(new URL(path, serverUrl), {
            method: 'GET',
            credentials: 'include',
            headers: { 'Accept': 'application/json' },
            signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) {
            throw new ApiError(response.status, 'Authentication with Octopus Deploy failed. Sign in to Octopus in another tab, then retry.');
        }
        if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After'), 10);
            const error = new ApiError(429, 'Octopus is rate limiting requests (HTTP 429). Please wait a moment and retry.');
            error.retryAfterMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : null;
            throw error;
        }
        if (!response.ok) {
            throw new ApiError(response.status, 'Octopus API call failed: ' + response.status + ' ' + response.statusText + ' (' + path + ')');
        }
        return await response.json();
    } catch (error) {
        if (error && error.name === 'AbortError') {
            throw new Error('Request timed out after ' + (REQUEST_TIMEOUT_MS / 1000) + 's (' + path + ')');
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

async function octoGet(serverUrl, path) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await getThrottledOctoGetOnce()(serverUrl, path);
        } catch (error) {
            if (error instanceof ApiError && error.status === 429 && attempt < RATE_LIMIT_RETRIES) {
                await sleep(error.retryAfterMs || RATE_LIMIT_BASE_DELAY_MS * (attempt + 1));
                continue;
            }
            throw error;
        }
    }
}

async function resolveSpaceId(serverUrl, spaceName) {
    const spaces = await octoGet(serverUrl, '/api/spaces/all');
    const match = (spaces || []).find(space => space.Name === spaceName)
        || (spaces || []).find(space => space.Name && space.Name.toLowerCase() === String(spaceName).toLowerCase());
    if (!match) {
        throw new Error('Could not find a space named "' + spaceName + '" on ' + serverUrl);
    }
    return match.Id;
}

async function resolveTaskId(serverUrl, spaceId, context) {
    if (context.deployment) {
        const deployment = await octoGet(serverUrl, '/api/' + spaceId + '/deployments/' + encodeURIComponent(context.deployment));
        return deployment.TaskId;
    }
    if (context.runbook_run) {
        const run = await octoGet(serverUrl, '/api/' + spaceId + '/runbookRuns/' + encodeURIComponent(context.runbook_run));
        return run.TaskId;
    }
    return null;
}

function fetchTaskDetails(serverUrl, spaceId, taskId) {
    return octoGet(serverUrl, '/api/' + spaceId + '/tasks/' + encodeURIComponent(taskId) + '/details?verbose=true');
}

/* ---------- status panel ---------- */

function showStatus(kind, title, message, actions) {
    const panel = byId('statusPanel');
    panel.replaceChildren();

    const card = el('div', 'card status-card ' + (kind === 'error' ? 'error' : 'info'));
    const heading = el('h2');
    if (kind === 'loading') {
        heading.appendChild(el('span', 'spinner'));
    }
    heading.appendChild(document.createTextNode(title));
    card.appendChild(heading);

    if (message) {
        card.appendChild(el('p', null, message));
    }

    if (actions && actions.length) {
        const row = el('div', 'status-actions');
        for (const action of actions) {
            const button = el('button', 'btn' + (action.primary ? ' btn-primary' : ''), action.label);
            button.addEventListener('click', action.onClick);
            row.appendChild(button);
        }
        card.appendChild(row);
    }

    panel.appendChild(card);
    panel.hidden = false;
}

function hideStatus() {
    const panel = byId('statusPanel');
    panel.hidden = true;
    panel.replaceChildren();
}

/* ---------- task panel ---------- */

const STATE_CHIP_CLASSES = {
    Executing: 'executing',
    Canceling: 'executing',
    Success: 'success',
    Failed: 'failed',
    TimedOut: 'failed',
    Queued: 'queued',
    Paused: 'queued',
};

function renderTaskPanel() {
    const panel = byId('taskPanel');
    panel.replaceChildren();

    if (!state.task) {
        panel.hidden = true;
        return;
    }

    const task = state.task;
    const head = el('div', 'task-head');

    // The task info doubles as a toggle for the task detail section
    const info = el('button', 'task-info');
    info.type = 'button';
    info.title = state.taskDetailOpen ? 'Hide task details' : 'Show task details';
    info.addEventListener('click', () => {
        state.taskDetailOpen = !state.taskDetailOpen;
        renderTaskPanel();
    });

    const desc = el('div', 'task-desc');
    desc.appendChild(el('span', 'task-chevron' + (state.taskDetailOpen ? ' open' : ''), '▶'));
    desc.appendChild(document.createTextNode(task.Description || task.Name || task.Id));
    info.appendChild(desc);

    const meta = el('div', 'task-meta');
    const context = (state.config && state.config.context) || {};
    // In history mode the user may have picked a different space/project than
    // the page the dashboard was opened from.
    const spaceName = state.mode === 'history' ? historySelectedSpaceName() : context.space;
    const projectName = state.mode === 'history' ? historySelectedProjectName() : context.project;
    if (spaceName) meta.appendChild(el('span', null, 'Space: ' + spaceName));
    if (projectName) meta.appendChild(el('span', null, 'Project: ' + projectName));
    if (state.stepName) meta.appendChild(el('span', null, 'Step: ' + state.stepName));
    if (task.Duration) meta.appendChild(el('span', null, 'Duration: ' + task.Duration));
    meta.appendChild(el('span', null, 'Updated: ' + new Date().toLocaleTimeString()));
    info.appendChild(meta);
    head.appendChild(info);

    const side = el('div', 'task-side');

    // When several steps look like Terraform plans (e.g. plan + apply, or
    // multiple stacks), let the user pick which one to render.
    if (state.stepCandidates && state.stepCandidates.length > 1) {
        const select = el('select', 'step-select');
        for (const candidate of state.stepCandidates) {
            const option = document.createElement('option');
            option.value = candidate.name;
            option.textContent = candidate.name;
            select.appendChild(option);
        }
        select.value = state.activeStepName || state.stepCandidates[0].name;
        select.addEventListener('change', () => {
            const chosen = state.stepCandidates.find(c => c.name === select.value);
            if (!chosen) return;
            state.activeStepName = chosen.name;
            state.stepName = chosen.name;
            state.openMap = {};
            state.parsed = parsePlan(chosen.text);
            renderPlan();
            renderTaskPanel();
        });
        side.appendChild(select);
    }

    const chipClass = STATE_CHIP_CLASSES[task.State] || 'other';
    const chip = el('span', 'state-chip ' + chipClass);
    if (state.polling) {
        chip.appendChild(el('span', 'live-dot'));
    }
    chip.appendChild(document.createTextNode(task.State || 'Unknown'));
    side.appendChild(chip);

    if (state.polling) {
        side.appendChild(el('span', 'poll-note', 'Polling every ' + (POLL_INTERVAL_MS / 1000) + 's'));
    }

    if (state.serverUrl && state.spaceId && state.taskId) {
        const link = el('a', 'task-link', 'Open in Octopus');
        link.href = state.serverUrl.replace(/\/+$/, '') + '/app#/' + state.spaceId + '/tasks/' + state.taskId;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        side.appendChild(link);
    }

    head.appendChild(side);
    panel.appendChild(head);

    if (state.taskDetailOpen) {
        panel.appendChild(renderTaskDetail(task));
    }

    panel.hidden = false;
}

function renderTaskDetail(task) {
    const detail = el('div', 'task-detail');

    const addRow = (label, value) => {
        if (!value) return;
        const row = el('div', 'task-detail-row');
        row.appendChild(el('span', 'task-detail-label', label));
        row.appendChild(el('span', 'task-detail-value', value));
        detail.appendChild(row);
    };

    const formatTime = iso => {
        const ms = Date.parse(iso);
        return Number.isFinite(ms) ? new Date(ms).toLocaleString() : null;
    };

    addRow('Task', task.Id);
    addRow('State', task.State);
    addRow('Queued', task.QueueTime && formatTime(task.QueueTime));
    addRow('Started', task.StartTime && formatTime(task.StartTime));
    addRow('Completed', task.CompletedTime && formatTime(task.CompletedTime));
    addRow('Duration', task.Duration);
    if (task.ErrorMessage) {
        addRow('Error', task.ErrorMessage);
        detail.lastChild.classList.add('error');
    }

    if (state.stepCandidates && state.stepCandidates.length) {
        addRow('Plan steps', state.stepCandidates.map(c => c.name).join(', '));
    }

    return detail;
}

/* ---------- plan rendering ---------- */

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'create', label: '+ Create' },
    { key: 'update', label: '~ Update' },
    { key: 'destroy', label: '- Destroy' },
    { key: 'replace', label: '± Replace' },
    { key: 'read', label: '<= Read' },
    { key: 'import', label: '» Import' },
];

function renderPlan() {
    const parsed = state.parsed;
    const planView = byId('planView');

    if (!parsed || (!parsed.planFound && !parsed.cleanText.trim())) {
        planView.hidden = true;
        return;
    }

    planView.hidden = false;

    renderBanners(parsed);
    renderSummaryStrip(parsed);
    renderFilterChips(parsed);
    renderWarnings(parsed);
    renderResources(parsed);
    renderOutputs(parsed);

    byId('rawLog').textContent = parsed.cleanText;
    byId('aiBtn').disabled = !parsed.planFound || state.aiBusy;

    updateViewVisibility();
}

function renderBanners(parsed) {
    const noChangesBanner = byId('noChangesBanner');
    if (parsed.noChanges) {
        noChangesBanner.textContent = '✓ ' + parsed.noChanges;
        noChangesBanner.hidden = false;
    } else {
        noChangesBanner.hidden = true;
    }

    const driftBanner = byId('driftBanner');
    if (parsed.drift) {
        driftBanner.textContent = 'Terraform detected changes made outside of Terraform (drift). Review the refresh section in the raw log.';
        driftBanner.hidden = false;
    } else {
        driftBanner.hidden = true;
    }
}

function renderSummaryStrip(parsed) {
    const strip = byId('summaryStrip');
    strip.replaceChildren();

    const counts = computeCounts(parsed);

    const sentence = el('div', 'plan-sentence');
    if (parsed.summary.line) {
        sentence.appendChild(el('span', null, parsed.summary.line));
    } else if (parsed.noChanges) {
        sentence.appendChild(el('span', null, parsed.noChanges));
    } else if (parsed.resources.length) {
        sentence.appendChild(el('span', null, parsed.resources.length + ' resource change(s) parsed so far…'));
    }
    if (state.stepName) {
        sentence.appendChild(el('span', 'step-name', 'from step "' + state.stepName + '"'));
    }
    if (sentence.childNodes.length) {
        strip.appendChild(sentence);
    }

    if (parsed.noChanges && !parsed.resources.length) {
        return;
    }

    const tiles = el('div', 'stat-tiles');
    tiles.appendChild(statTile('add', counts.add, 'To add', null, 'tile-add'));
    tiles.appendChild(statTile('change', counts.change, 'To change', null, 'tile-change'));
    tiles.appendChild(statTile('destroy', counts.destroy, 'To destroy', null, 'tile-destroy'));
    if (counts.replace > 0) {
        tiles.appendChild(statTile('replace', counts.replace, 'Replacements', 'counted in add + destroy', 'replace'));
    }
    if (counts.imports) {
        tiles.appendChild(statTile('import', counts.imports, 'To import', null, 'import'));
    }
    strip.appendChild(tiles);
}

// Tiles double as filters: clicking one filters the resource list to the
// resources behind that number; clicking it again clears the filter.
function statTile(kind, value, label, note, filterKey) {
    const active = filterKey && state.filter === filterKey;
    const tile = el('button', 'stat-tile ' + kind + (active ? ' active' : ''));
    tile.type = 'button';
    tile.title = active ? 'Clear filter' : 'Filter resources: ' + label.toLowerCase();

    const iconBox = el('div', 'stat-icon');
    iconBox.appendChild(svgIcon(kind));
    tile.appendChild(iconBox);

    const text = el('div', 'stat-text');
    text.appendChild(el('div', 'stat-value', String(value)));
    text.appendChild(el('div', 'stat-label', label));
    if (note) {
        text.appendChild(el('div', 'stat-note', note));
    }
    tile.appendChild(text);

    if (filterKey) {
        tile.addEventListener('click', () => {
            state.filter = state.filter === filterKey ? 'all' : filterKey;
            renderSummaryStrip(state.parsed);
            renderFilterChips(state.parsed);
            renderResources(state.parsed);
        });
    }
    return tile;
}

function renderFilterChips(parsed) {
    const container = byId('filterChips');
    container.replaceChildren();

    const counts = computeCounts(parsed);

    for (const filter of FILTERS) {
        const count = filter.key === 'all' ? parsed.resources.length : counts.byAction[filter.key];
        if (filter.key !== 'all' && !count) continue;

        const chip = el('button', 'chip' + (state.filter === filter.key ? ' active' : ''));
        chip.appendChild(document.createTextNode(filter.label));
        chip.appendChild(el('span', 'chip-count', String(count)));
        chip.addEventListener('click', () => {
            state.filter = filter.key;
            renderFilterChips(state.parsed);
            renderResources(state.parsed);
        });
        container.appendChild(chip);
    }

    if (parsed.warnings.length) {
        const chip = el('button', 'chip warn-chip');
        chip.appendChild(document.createTextNode('⚠ Warnings'));
        chip.appendChild(el('span', 'chip-count', String(parsed.warnings.length)));
        chip.addEventListener('click', () => {
            state.warningsOpen = !state.warningsOpen;
            renderWarnings(state.parsed);
        });
        container.appendChild(chip);
    }
}

function renderWarnings(parsed) {
    const panel = byId('warningsPanel');
    panel.replaceChildren();

    if (!parsed.warnings.length) {
        panel.hidden = true;
        return;
    }

    for (const warning of parsed.warnings) {
        const card = el('div', 'card warning-card severity-' + warning.severity);
        card.appendChild(el('div', 'warning-title', (warning.severity === 'error' ? 'Error: ' : 'Warning: ') + warning.title));
        if (warning.lines.length) {
            card.appendChild(el('div', 'warning-body', warning.lines.join('\n')));
        }
        panel.appendChild(card);
    }
    // Collapsed by default; the warnings chip toggles visibility
    panel.hidden = !state.warningsOpen;
}

function resourceMatchesSearch(resource, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    if (resource.address.toLowerCase().includes(q)) return true;
    return resource.lines.some(line => line.toLowerCase().includes(q));
}

function renderResources(parsed) {
    const list = byId('resourceList');
    list.replaceChildren();

    const visible = parsed.resources.filter(resource =>
        filterMatches(resource.action, state.filter)
        && resourceMatchesSearch(resource, state.search));

    const defaultOpen = visible.length <= DEFAULT_OPEN_THRESHOLD;

    if (!visible.length && parsed.resources.length) {
        list.appendChild(el('p', 'panel-hint', 'No resources match the current filter.'));
        return;
    }

    for (const resource of visible) {
        const isOpen = state.openMap[resource.address] !== undefined
            ? state.openMap[resource.address]
            : defaultOpen;

        const card = el('div', 'resource-card action-' + resource.action + (isOpen ? ' open' : ''));

        const head = el('button', 'resource-head');
        head.appendChild(el('span', 'action-badge ' + resource.action, ACTION_LABELS[resource.action] || resource.action));
        head.appendChild(el('code', 'resource-address', resource.address));

        const flags = el('span', 'resource-flags');
        if (resource.forcesReplacement) {
            flags.appendChild(el('span', 'flag forces', 'forces replacement'));
        }
        head.appendChild(flags);
        head.appendChild(el('span', 'chevron', '▶'));

        const body = el('div', 'resource-body');
        body.hidden = !isOpen;

        if (resource.reason) {
            body.appendChild(el('div', 'resource-reason', 'Reason: ' + resource.reason));
        }

        // The card header already shows the address and action, so skip the
        // "# address will be ..." comment line when rendering the body.
        const bodyLines = resource.lines.length && matchResourceHeader(resource.lines[0])
            ? resource.lines.slice(1)
            : resource.lines;

        const loglines = el('div', 'loglines');
        for (const line of bodyLines) {
            const cls = classifyLine(line);
            const lineEl = el('div', 'ln ln-' + cls, line === '' ? ' ' : line);
            if (line.includes('# forces replacement')) {
                lineEl.classList.add('ln-forces');
            }
            loglines.appendChild(lineEl);
        }
        body.appendChild(loglines);

        head.addEventListener('click', () => {
            const nowOpen = body.hidden;
            body.hidden = !nowOpen;
            card.classList.toggle('open', nowOpen);
            state.openMap[resource.address] = nowOpen;
        });

        card.appendChild(head);
        card.appendChild(body);
        list.appendChild(card);
    }
}

function renderOutputs(parsed) {
    const card = byId('outputsCard');
    card.replaceChildren();

    if (!parsed.outputs.length) {
        card.hidden = true;
        return;
    }

    card.appendChild(el('div', 'outputs-title', 'Changes to Outputs'));

    const symbolClass = { '+': 'add', '~': 'change', '-': 'remove' };
    for (const output of parsed.outputs) {
        const row = el('div', 'output-row sym-' + (symbolClass[output.symbol] || 'add'));
        row.appendChild(el('span', 'output-symbol', output.symbol));
        row.appendChild(el('span', 'output-name', output.name));
        row.appendChild(el('span', 'output-value', '= ' + output.value));
        card.appendChild(row);
    }

    card.hidden = false;
}

function updateViewVisibility() {
    const pretty = state.view === 'pretty';
    byId('prettyView').hidden = !pretty;
    byId('rawView').hidden = pretty;
    byId('viewPretty').classList.toggle('active', pretty);
    byId('viewRaw').classList.toggle('active', !pretty);
}

/* ---------- AI summary ---------- */

async function runAiSummary() {
    if (state.aiBusy || !state.parsed || !state.parsed.planFound) return;

    state.aiBusy = true;
    const aiBtn = byId('aiBtn');
    aiBtn.disabled = true;
    aiBtn.textContent = '✦ Summarizing…';

    const panel = byId('aiPanel');
    panel.replaceChildren();

    const head = el('div', 'ai-panel-head');
    head.appendChild(el('span', 'ai-panel-title', 'AI change summary'));
    const closeBtn = el('button', 'btn btn-small', 'Dismiss');
    closeBtn.addEventListener('click', () => { panel.hidden = true; });
    head.appendChild(closeBtn);
    panel.appendChild(head);

    const body = el('div', 'ai-panel-body', 'Analyzing the plan…');
    panel.appendChild(body);
    panel.hidden = false;

    try {
        // The AI Assistant needs the space and project names in the prompt. In
        // history mode the user may have picked a different space/project than
        // the page the dashboard was opened from, so prefer the selection.
        const context = Object.assign({}, (state.config && state.config.context) || {});
        if (state.mode === 'history') {
            context.space = historySelectedSpaceName() || context.space;
            context.project = historySelectedProjectName() || context.project;
        }
        const prompt = buildAiPrompt(state.parsed, context);

        if (state.extensionMode && typeof dashboardSendPrompt === 'function' && state.serverUrl) {
            const result = await dashboardSendPrompt(prompt, state.serverUrl);
            if (result && result.state === 'Success') {
                renderMarkdownInto(body, result.response);
                panel.appendChild(el('div', 'ai-panel-note', 'Generated by the Octopus AI Assistant.'));
            } else {
                body.textContent = (result && result.response) || 'The AI Assistant could not summarize this plan. Please try again.';
            }
        } else {
            body.textContent = 'The AI summary is generated by the Octopus AI Assistant, which is only available when this dashboard is launched from the extension.';
        }
    } catch (error) {
        body.textContent = 'AI summary failed: ' + (error && error.message ? error.message : String(error));
    } finally {
        state.aiBusy = false;
        aiBtn.disabled = false;
        aiBtn.textContent = '✦ Summarize with AI';
    }
}

/* ---------- live mode ---------- */

function stopPolling() {
    if (state.pollTimer) {
        clearTimeout(state.pollTimer);
        state.pollTimer = null;
    }
    state.polling = false;
}

function schedulePoll() {
    stopPolling();
    state.polling = true;
    state.pollTimer = setTimeout(() => {
        pollOnce().catch(() => { /* handled in pollOnce */ });
    }, POLL_INTERVAL_MS);
}

async function pollOnce() {
    if (state.mode !== 'live' && state.mode !== 'history') return;

    try {
        const details = await fetchTaskDetails(state.serverUrl, state.spaceId, state.taskId);
        state.pollFailures = 0;
        state.task = details.Task || state.task;

        const candidates = pickTerraformSteps(details.ActivityLogs);
        state.stepCandidates = candidates;

        // Keep the user's step choice across polls; default to the best match
        let activeIndex = candidates.findIndex(c => c.name === state.activeStepName);
        if (activeIndex < 0) activeIndex = 0;

        const step = candidates.length ? candidates[activeIndex] : null;
        state.activeStepName = step ? step.name : null;
        const text = step ? step.text : collectLogText({ Children: details.ActivityLogs }, []).join('\n');
        state.stepName = step ? step.name : null;
        state.parsed = parsePlan(text);

        hideStatus();

        const running = state.task && !state.task.IsCompleted;
        state.polling = running;
        renderTaskPanel();
        await refreshInterventionBanner();

        if (!state.parsed.planFound) {
            if (running) {
                showStatus('loading', 'Waiting for Terraform plan output…',
                    'The task is running. The plan will render here as soon as the Terraform step starts logging.');
            } else {
                showStatus('info', 'No Terraform plan found in this task',
                    'No Terraform or OpenTofu plan output was detected in the task log. The raw log is shown below.');
            }
        }
        renderPlan();

        if (running) {
            schedulePoll();
        } else {
            stopPolling();
            renderTaskPanel();
        }
    } catch (error) {
        state.pollFailures += 1;
        const isAuth = error instanceof ApiError && (error.status === 401 || error.status === 403);

        if (isAuth || state.pollFailures >= MAX_POLL_FAILURES) {
            stopPolling();
            renderTaskPanel();
            showStatus('error',
                isAuth ? 'Authentication required' : 'Could not load the task',
                (error && error.message) || String(error),
                [{
                    label: 'Retry',
                    primary: true,
                    onClick: () => {
                        state.pollFailures = 0;
                        if (state.mode === 'history') {
                            pollOnce().catch(() => { /* handled in pollOnce */ });
                        } else {
                            startLiveMode();
                        }
                    },
                }]);
        } else {
            schedulePoll();
        }
    }
}

/* ---------- manual intervention banner ---------- */

async function refreshInterventionBanner() {
    const task = state.task;
    const pending = !!(task && !task.IsCompleted && task.HasPendingInterruptions);

    if (!pending) {
        state.interruption = null;
        renderInterventionBanner();
        return;
    }

    // Only fetch the interruption details once per paused task; the banner is
    // re-rendered from state on every poll.
    if (!state.interruption || state.interruption.taskId !== state.taskId) {
        let summary = null;
        try {
            const response = await octoGet(state.serverUrl,
                '/api/' + state.spaceId + '/interruptions?regarding=' + encodeURIComponent(state.taskId) + '&pendingOnly=true');
            summary = extractPendingInterruption(response.Items);
        } catch (error) {
            // The banner still shows without the title/instructions detail
        }
        state.interruption = {
            taskId: state.taskId,
            title: (summary && summary.title) || 'Manual intervention',
            instructions: (summary && summary.instructions) || '',
        };
    }

    renderInterventionBanner();
}

function renderInterventionBanner() {
    const banner = byId('interventionBanner');
    banner.replaceChildren();

    const info = state.interruption;
    if (!info) {
        banner.hidden = true;
        return;
    }

    const head = el('div', 'mi-head');
    head.appendChild(el('span', 'mi-icon', '⏸'));

    const titles = el('div', 'mi-titles');
    const titleText = info.title && info.title !== 'Manual intervention'
        ? 'Awaiting manual intervention: ' + info.title
        : 'Awaiting manual intervention';
    titles.appendChild(el('div', 'mi-title', titleText));
    titles.appendChild(el('div', 'mi-sub', 'This deployment is paused for approval. Review the plan below, then respond in Octopus.'));
    head.appendChild(titles);

    if (state.serverUrl && state.spaceId && state.taskId) {
        const link = el('a', 'mi-link', 'Review & respond in Octopus');
        link.href = state.serverUrl.replace(/\/+$/, '') + '/app#/' + state.spaceId + '/tasks/' + state.taskId;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        head.appendChild(link);
    }

    banner.appendChild(head);

    if (info.instructions) {
        const text = info.instructions.length > MI_INSTRUCTIONS_CHAR_LIMIT
            ? info.instructions.slice(0, MI_INSTRUCTIONS_CHAR_LIMIT) + '…'
            : info.instructions;
        const instructions = el('div', 'mi-instructions');
        renderMarkdownInto(instructions, text);
        banner.appendChild(instructions);
    }

    banner.hidden = false;
}

async function startLiveMode() {
    stopPolling();

    if (!state.extensionMode) {
        showStatus('info', 'Live mode needs the Octopus AI Assistant extension',
            'Live mode reads the task log using your Octopus portal session, which is only available when this dashboard is launched from the extension. Use the Paste log tab here.');
        return;
    }

    const context = (state.config && state.config.context) || {};

    if (!context.deployment && !context.runbook_run) {
        showStatus('info', 'Open this dashboard from a deployment or runbook run',
            'Navigate to a deployment or runbook run in Octopus (ideally one with a Terraform step), then launch this dashboard from the Octopus AI Assistant. The task is picked up automatically from the page you were viewing. Alternatively, use the History tab to browse past deployments.');
        return;
    }

    if (!context.space) {
        showStatus('error', 'Could not determine the current space',
            'The dashboard context did not include the space name. Try reopening the dashboard from the Octopus portal.');
        return;
    }

    try {
        showStatus('loading', 'Connecting to ' + state.serverUrl + '…', 'Resolving the task for this ' + (context.deployment ? 'deployment' : 'runbook run') + '.');

        state.spaceId = await resolveSpaceId(state.serverUrl, context.space);
        state.taskId = await resolveTaskId(state.serverUrl, state.spaceId, context);

        if (!state.taskId) {
            showStatus('error', 'Could not resolve the task', 'The deployment or runbook run did not reference a server task.');
            return;
        }

        state.pollFailures = 0;
        await pollOnce();
    } catch (error) {
        const isAuth = error instanceof ApiError && (error.status === 401 || error.status === 403);
        showStatus('error',
            isAuth ? 'Authentication required' : 'Could not load the task',
            (error && error.message) || String(error),
            [{ label: 'Retry', primary: true, onClick: () => startLiveMode() }]);
    }
}

/* ---------- history mode ---------- */

function selectedOptionName(selectId, items) {
    const select = byId(selectId);
    const item = (items || []).find(i => i.Id === select.value);
    return item ? (item.Name || item.Id) : null;
}

function historySelectedProjectName() {
    return selectedOptionName('historyProject', state.history.projects);
}

function historySelectedSpaceName() {
    return selectedOptionName('historySpace', state.history.spaces);
}

function populateSelect(selectId, items, preferredName) {
    const select = byId(selectId);
    select.replaceChildren();

    const sorted = [...(items || [])].sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
    for (const item of sorted) {
        const option = document.createElement('option');
        option.value = item.Id;
        option.textContent = item.Name || item.Id;
        select.appendChild(option);
    }

    if (preferredName) {
        const preferred = sorted.find(i => i.Name === preferredName);
        if (preferred) select.value = preferred.Id;
    }
}

function populateEnvironmentSelect() {
    const select = byId('historyEnvironment');
    select.replaceChildren();

    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'All environments';
    select.appendChild(all);

    const sorted = [...state.history.environmentList].sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
    for (const environment of sorted) {
        const option = document.createElement('option');
        option.value = environment.Id;
        option.textContent = environment.Name || environment.Id;
        select.appendChild(option);
    }
}

// (Re)load projects and environments for the currently selected space, then
// load the first page of deployments for the selected project.
async function loadSpaceScope(preferredProjectName) {
    state.history.projects = await octoGet(state.serverUrl, '/api/' + state.spaceId + '/projects/all') || [];
    populateSelect('historyProject', state.history.projects, preferredProjectName);

    state.history.environmentList = await octoGet(state.serverUrl, '/api/' + state.spaceId + '/environments/all') || [];
    state.history.environments = buildNameMap(state.history.environmentList);
    populateEnvironmentSelect();

    if (!state.history.projects.length) {
        state.history.rows = [];
        state.history.totalResults = 0;
        renderHistoryList();
        showStatus('info', 'No projects found',
            'The space "' + (historySelectedSpaceName() || '') + '" does not contain any projects visible to your account.');
        return;
    }

    await loadHistory({ reset: true });
}

async function startHistoryMode() {
    stopPolling();

    if (!state.extensionMode) {
        showStatus('info', 'History needs the Octopus AI Assistant extension',
            'Browsing past deployments reads the Octopus API using your portal session, which is only available when this dashboard is launched from the extension. Use the Paste log tab here.');
        return;
    }

    const context = (state.config && state.config.context) || {};

    try {
        showStatus('loading', 'Loading deployment history…', 'Fetching recent deployments from ' + state.serverUrl + '.');

        if (!state.history.spaces.length) {
            state.history.spaces = await octoGet(state.serverUrl, '/api/spaces/all') || [];
            populateSelect('historySpace', state.history.spaces, context.space);
        }

        if (!state.history.spaces.length) {
            showStatus('error', 'No spaces found',
                'Your account cannot see any spaces on ' + state.serverUrl + '.');
            return;
        }

        state.spaceId = byId('historySpace').value;

        if (!state.history.projects.length) {
            await loadSpaceScope(context.project);
        } else {
            await loadHistory({ reset: true });
        }
    } catch (error) {
        const isAuth = error instanceof ApiError && (error.status === 401 || error.status === 403);
        showStatus('error',
            isAuth ? 'Authentication required' : 'Could not load deployment history',
            (error && error.message) || String(error),
            [{ label: 'Retry', primary: true, onClick: () => startHistoryMode() }]);
    }
}

async function loadHistory(options) {
    const reset = !!(options && options.reset);
    const projectId = byId('historyProject').value;
    if (!projectId || state.history.loading) return;
    state.history.loading = true;

    try {
        if (reset) {
            showStatus('loading', 'Loading deployment history…', null);
            state.history.rows = [];
            state.history.totalResults = 0;
            state.history.selectedDeploymentId = null;
            renderHistoryList();
        }

        let query = '/api/' + state.spaceId + '/deployments?projects=' + encodeURIComponent(projectId)
            + '&take=' + HISTORY_PAGE_SIZE + '&skip=' + state.history.rows.length;
        const environmentId = byId('historyEnvironment').value;
        if (environmentId) {
            query += '&environments=' + encodeURIComponent(environmentId);
        }

        const deployments = await octoGet(state.serverUrl, query);
        const items = (deployments && deployments.Items) || [];
        state.history.totalResults = (deployments && deployments.TotalResults) || items.length;

        const releases = await octoGet(state.serverUrl,
            '/api/' + state.spaceId + '/projects/' + encodeURIComponent(projectId) + '/releases?take=' + RELEASE_LOOKUP_SIZE);
        const versions = buildVersionMap((releases && releases.Items) || []);

        // Task states (Success/Failed/awaiting intervention) are a nice-to-have;
        // the list still works if this lookup fails.
        let tasks = {};
        const taskIds = items.map(d => d.TaskId).filter(Boolean);
        if (taskIds.length) {
            try {
                const taskPage = await octoGet(state.serverUrl,
                    '/api/' + state.spaceId + '/tasks?ids=' + encodeURIComponent(taskIds.join(',')) + '&take=' + taskIds.length);
                tasks = buildTaskMap((taskPage && taskPage.Items) || []);
            } catch (error) {
                // ignore - rows render without state chips
            }
        }

        const newRows = items.map(deployment =>
            describeDeployment(deployment, { versions, environments: state.history.environments, tasks }));
        state.history.rows = state.history.rows.concat(newRows);

        hideStatus();
        renderHistoryList();
    } catch (error) {
        const isAuth = error instanceof ApiError && (error.status === 401 || error.status === 403);
        showStatus('error',
            isAuth ? 'Authentication required' : 'Could not load deployment history',
            (error && error.message) || String(error),
            [{ label: 'Retry', primary: true, onClick: () => loadHistory({ reset: true }) }]);
    } finally {
        state.history.loading = false;
    }
}

function renderHistoryList() {
    const list = byId('historyList');
    const footer = byId('historyFooter');
    list.replaceChildren();
    footer.replaceChildren();

    const from = byId('historyFrom').value;
    const to = byId('historyTo').value;
    const visible = filterRowsByDate(state.history.rows, from, to);

    if (!visible.length) {
        if (!state.history.loading) {
            const message = state.history.rows.length
                ? 'No loaded deployments match the selected date range. Use "Load more" to fetch older deployments.'
                : 'No deployments found for this project yet. Deployments older than the space retention policy are no longer available.';
            list.appendChild(el('p', 'panel-hint', message));
        }
    }

    const now = Date.now();

    for (const row of visible) {
        const button = el('button', 'history-row' + (row.deploymentId === state.history.selectedDeploymentId ? ' active' : ''));

        const chipClass = STATE_CHIP_CLASSES[row.state] || 'other';
        button.appendChild(el('span', 'state-chip ' + chipClass, row.state || '—'));

        const main = el('span', 'history-main');
        main.appendChild(el('span', 'history-release', row.version ? 'Release ' + row.version : row.name));
        if (row.environmentName) {
            main.appendChild(el('span', 'history-env', row.environmentName));
        }
        button.appendChild(main);

        if (row.awaitingIntervention) {
            button.appendChild(el('span', 'mi-chip', '⏸ awaiting approval'));
        }

        if (row.created) {
            const when = el('span', 'history-when');
            when.appendChild(el('span', 'history-age', relativeAge(row.created, now)));
            when.appendChild(el('span', 'history-stamp', new Date(row.created).toLocaleString()));
            button.appendChild(when);
        }

        button.addEventListener('click', () => selectHistoryDeployment(row));
        list.appendChild(button);
    }

    // Footer: loaded count and pagination
    if (state.history.rows.length) {
        const note = 'Showing ' + visible.length + ' of ' + state.history.rows.length + ' loaded'
            + (state.history.totalResults > state.history.rows.length
                ? ' (' + state.history.totalResults + ' total)'
                : '');
        footer.appendChild(el('span', 'history-count', note));
    }
    if (state.history.rows.length < state.history.totalResults) {
        const more = el('button', 'btn btn-small', state.history.loading ? 'Loading…' : 'Load more');
        more.disabled = state.history.loading;
        more.addEventListener('click', () => loadHistory({ reset: false }));
        footer.appendChild(more);
    }
}

async function selectHistoryDeployment(row) {
    if (!row.taskId) {
        showStatus('error', 'No task available',
            'This deployment does not reference a server task, so its log cannot be loaded.');
        return;
    }

    state.history.selectedDeploymentId = row.deploymentId;
    renderHistoryList();

    stopPolling();
    state.task = null;
    state.taskId = row.taskId;
    state.stepCandidates = [];
    state.activeStepName = null;
    state.stepName = null;
    state.openMap = {};
    state.parsed = null;
    state.pollFailures = 0;
    byId('planView').hidden = true;
    byId('aiPanel').hidden = true;
    renderTaskPanel();

    const label = row.version ? 'release ' + row.version : row.name;
    showStatus('loading', 'Loading plan for ' + label + '…',
        row.environmentName ? 'Deployed to ' + row.environmentName + '.' : null);

    await pollOnce();
}

/* ---------- mode switching & bootstrap ---------- */

function setMode(mode) {
    state.mode = mode;
    storageSet('mode', mode);

    for (const tab of document.querySelectorAll('#sourceTabs .tab')) {
        tab.classList.toggle('active', tab.dataset.tab === mode);
    }

    byId('pastePanel').hidden = mode !== 'paste';
    byId('historyPanel').hidden = mode !== 'history';
    byId('taskPanel').hidden = (mode !== 'live' && mode !== 'history') || !state.task;
    byId('planView').hidden = true;
    byId('aiPanel').hidden = true;
    hideStatus();

    stopPolling();
    state.openMap = {};
    state.filter = 'all';
    state.search = '';
    state.stepCandidates = [];
    state.activeStepName = null;
    state.interruption = null;
    state.taskDetailOpen = false;
    renderInterventionBanner();
    byId('searchInput').value = '';

    if (mode === 'live') {
        state.task = null;
        startLiveMode();
    } else if (mode === 'history') {
        state.task = null;
        state.history.selectedDeploymentId = null;
        renderTaskPanel();
        startHistoryMode();
    } else if (mode === 'paste') {
        const existing = byId('pasteInput').value;
        if (existing && existing.trim()) {
            state.parsed = parsePlan(existing);
            state.stepName = null;
            renderPlan();
        }
    }
}

function wireEvents() {
    for (const tab of document.querySelectorAll('#sourceTabs .tab')) {
        tab.addEventListener('click', () => setMode(tab.dataset.tab));
    }

    byId('viewPretty').addEventListener('click', () => {
        state.view = 'pretty';
        storageSet('view', 'pretty');
        updateViewVisibility();
    });
    byId('viewRaw').addEventListener('click', () => {
        state.view = 'raw';
        storageSet('view', 'raw');
        updateViewVisibility();
    });

    byId('searchInput').addEventListener('input', event => {
        state.search = event.target.value.trim();
        if (state.parsed) renderResources(state.parsed);
    });

    byId('expandAllBtn').addEventListener('click', () => {
        if (!state.parsed) return;
        for (const resource of state.parsed.resources) state.openMap[resource.address] = true;
        renderResources(state.parsed);
    });
    byId('collapseAllBtn').addEventListener('click', () => {
        if (!state.parsed) return;
        for (const resource of state.parsed.resources) state.openMap[resource.address] = false;
        renderResources(state.parsed);
    });

    byId('aiBtn').addEventListener('click', runAiSummary);

    byId('pasteRenderBtn').addEventListener('click', () => {
        const text = byId('pasteInput').value;
        if (!text.trim()) return;
        state.openMap = {};
        state.parsed = parsePlan(text);
        state.stepName = null;
        hideStatus();
        renderPlan();
        if (!state.parsed.planFound) {
            showStatus('info', 'No Terraform plan detected',
                'The pasted text does not look like Terraform or OpenTofu plan output. The raw view is still available.');
        }
    });
    byId('pasteClearBtn').addEventListener('click', () => {
        byId('pasteInput').value = '';
        byId('planView').hidden = true;
        hideStatus();
    });

    byId('historySpace').addEventListener('change', async event => {
        state.spaceId = event.target.value;
        state.history.projects = [];
        state.history.environments = null;
        state.history.environmentList = [];
        state.history.rows = [];
        state.history.totalResults = 0;
        state.history.selectedDeploymentId = null;
        try {
            showStatus('loading', 'Loading deployment history…', null);
            await loadSpaceScope(null);
        } catch (error) {
            showStatus('error', 'Could not load deployment history',
                (error && error.message) || String(error),
                [{ label: 'Retry', primary: true, onClick: () => startHistoryMode() }]);
        }
    });
    byId('historyProject').addEventListener('change', () => loadHistory({ reset: true }));
    byId('historyEnvironment').addEventListener('change', () => loadHistory({ reset: true }));
    byId('historyFrom').addEventListener('change', () => renderHistoryList());
    byId('historyTo').addEventListener('change', () => renderHistoryList());
    byId('historyRefreshBtn').addEventListener('click', () => loadHistory({ reset: true }));

    byId('serverSelect').addEventListener('change', event => {
        state.serverUrl = event.target.value;
        // Space, project, and environment ids are all server-specific
        state.spaceId = null;
        resetHistoryCache();
        if (state.mode === 'live') startLiveMode();
        if (state.mode === 'history') startHistoryMode();
    });

    // Pause polling while the tab is hidden; resume when it becomes visible
    document.addEventListener('visibilitychange', () => {
        if (state.mode !== 'live' && state.mode !== 'history') return;
        if (document.hidden) {
            if (state.polling) stopPolling();
        } else if (state.task && !state.task.IsCompleted && state.taskId) {
            state.pollFailures = 0;
            state.polling = true;
            pollOnce().catch(() => { /* handled in pollOnce */ });
        }
    });
}

async function bootstrapDashboard() {
    wireEvents();

    state.view = storageGet('view', 'pretty') === 'raw' ? 'raw' : 'pretty';

    const config = await getExtensionConfig();
    state.config = config;
    state.extensionMode = !!(config && config.lastServerUrl);
    state.serverUrl = state.extensionMode ? config.lastServerUrl : null;

    const modeBadge = byId('modeBadge');
    if (state.extensionMode) {
        modeBadge.textContent = 'Connected';
        modeBadge.classList.add('live');

        const serverUrls = (config.serverUrls || []).filter(Boolean);
        if (serverUrls.length > 1) {
            const select = byId('serverSelect');
            for (const url of serverUrls) {
                const option = document.createElement('option');
                option.value = url;
                option.textContent = url;
                select.appendChild(option);
            }
            select.value = config.lastServerUrl;
            select.hidden = false;
            byId('serverLabel').hidden = false;
        }
    } else {
        modeBadge.textContent = 'Standalone';
    }
    modeBadge.hidden = false;

    const context = (config && config.context) || {};

    let initialMode;
    if (state.extensionMode && (context.deployment || context.runbook_run)) {
        initialMode = 'live';
    } else if (state.extensionMode) {
        // Not on a deployment page - go straight to browsing past plans
        initialMode = 'history';
    } else {
        initialMode = 'paste';
    }

    setMode(initialMode);
}

/* ==========================================================================
   Bootstrap / test exports
   ========================================================================== */

const isCommonJsRuntime = typeof module !== 'undefined' && typeof module.exports !== 'undefined';

if (!isCommonJsRuntime) {
    document.addEventListener('DOMContentLoaded', bootstrapDashboard);
}

if (typeof module !== 'undefined') {
    module.exports = {
        stripAnsi,
        stripLogPrefix,
        normalizePlanText,
        matchResourceHeader,
        classifyLine,
        parsePlan,
        computeCounts,
        collectLogText,
        pickTerraformStep,
        pickTerraformSteps,
        buildAiPrompt,
        buildNameMap,
        buildVersionMap,
        buildTaskMap,
        describeDeployment,
        relativeAge,
        filterRowsByDate,
        filterMatches,
        extractPendingInterruption,
        parseInline,
        parseMarkdownBlocks,
    };
}
