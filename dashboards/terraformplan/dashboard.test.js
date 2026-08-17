'use strict';

const {
    stripAnsi,
    stripLogPrefix,
    normalizePlanText,
    matchResourceHeader,
    classifyLine,
    parsePlan,
    computeCounts,
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
} = require('./dashboard');

// Test fixture: a representative 'Plan to apply a Terraform template' task log.
const SAMPLE_PLAN_LOG = [
    'Using Terraform version 1.7.5',
    'Initializing the backend...',
    'Successfully configured the backend "s3"!',
    'Initializing provider plugins...',
    '- Reusing previous version of hashicorp/aws from the dependency lock file',
    '- Using previously-installed hashicorp/aws v5.54.1',
    'Terraform has been successfully initialized!',
    'data.aws_ami.ubuntu: Reading...',
    'aws_iam_role.octopub_lambda: Refreshing state... [id=octopub-lambda-role]',
    'aws_sqs_queue.legacy: Refreshing state... [id=https://sqs.ap-southeast-2.amazonaws.com/012345678901/legacy-queue]',
    'aws_lambda_function.api: Refreshing state... [id=octopub-products-api]',
    'aws_cloudwatch_metric_alarm.api_errors: Refreshing state... [id=octopub-api-error-alarm]',
    'aws_instance.web: Refreshing state... [id=i-0f83a4b7de2c91a07]',
    'data.aws_ami.ubuntu: Read complete after 1s [id=ami-0d6f74b9139d26bf1]',
    '',
    'Terraform used the selected providers to generate the following execution',
    'plan. Resource actions are indicated with the following symbols:',
    '  + create',
    '  ~ update in-place',
    '  - destroy',
    '-/+ destroy and then create replacement',
    '',
    'Terraform will perform the following actions:',
    '',
    '  # aws_s3_bucket.assets will be created',
    '  + resource "aws_s3_bucket" "assets" {',
    '      + bucket        = "octopub-assets-production"',
    '      + force_destroy = false',
    '      + arn           = (known after apply)',
    '      + id            = (known after apply)',
    '      + tags          = {',
    '          + "Environment" = "Production"',
    '          + "Team"        = "Platform"',
    '        }',
    '    }',
    '',
    '  # module.network.aws_subnet.private[0] will be created',
    '  + resource "aws_subnet" "private" {',
    '      + availability_zone = "ap-southeast-2a"',
    '      + cidr_block        = "10.0.32.0/20"',
    '      + vpc_id            = "vpc-08d21a7bd1f3e9a55"',
    '      + id                = (known after apply)',
    '    }',
    '',
    '  # aws_lambda_function.api will be updated in-place',
    '  ~ resource "aws_lambda_function" "api" {',
    '        id            = "octopub-products-api"',
    '      ~ memory_size   = 512 -> 1024',
    '      ~ timeout       = 30 -> 60',
    '      ~ environment {',
    '          ~ variables = {',
    '              ~ "LOG_LEVEL" = "warn" -> "info"',
    '            }',
    '        }',
    '        # (14 unchanged attributes hidden)',
    '    }',
    '',
    '  # aws_cloudwatch_metric_alarm.api_errors will be updated in-place',
    '  ~ resource "aws_cloudwatch_metric_alarm" "api_errors" {',
    '        id        = "octopub-api-error-alarm"',
    '      ~ threshold = 25 -> 10',
    '        # (11 unchanged attributes hidden)',
    '    }',
    '',
    '  # aws_instance.web must be replaced',
    '-/+ resource "aws_instance" "web" {',
    '      ~ ami                    = "ami-0310483fb2b488153" -> "ami-0d6f74b9139d26bf1" # forces replacement',
    '      ~ id                     = "i-0f83a4b7de2c91a07" -> (known after apply)',
    '      ~ private_ip             = "10.0.12.41" -> (known after apply)',
    '        tags                   = {',
    '            "Name" = "octopub-web"',
    '        }',
    '      # (28 unchanged attributes hidden)',
    '    }',
    '',
    '  # aws_sqs_queue.legacy will be destroyed',
    '  # (because aws_sqs_queue.legacy is not in configuration)',
    '  - resource "aws_sqs_queue" "legacy" {',
    '      - arn                       = "arn:aws:sqs:ap-southeast-2:012345678901:legacy-queue" -> null',
    '      - message_retention_seconds = 345600 -> null',
    '      - name                      = "legacy-queue" -> null',
    '    }',
    '',
    'Plan: 3 to add, 2 to change, 2 to destroy.',
    '',
    'Changes to Outputs:',
    '  + assets_bucket = "octopub-assets-production"',
    '  ~ web_public_ip = "54.206.112.87" -> (known after apply)',
    '',
    'Warning: Argument is deprecated',
    '',
    '  with aws_s3_bucket.assets,',
    '  on s3.tf line 4, in resource "aws_s3_bucket" "assets":',
    '   4:   acl = "private"',
    '',
    'Use the aws_s3_bucket_acl resource instead.',
].join('\n');

describe('text utilities', () => {
    test('stripLogPrefix removes Octopus raw log prefixes', () => {
        expect(stripLogPrefix('10:23:45   Info     |         Terraform will perform the following actions:'))
            .toBe('        Terraform will perform the following actions:');
        expect(stripLogPrefix('09:01:02   Verbose  | Using Terraform version 1.7.5'))
            .toBe('Using Terraform version 1.7.5');
    });

    test('stripLogPrefix leaves plain plan lines untouched', () => {
        expect(stripLogPrefix('  + resource "aws_s3_bucket" "assets" {'))
            .toBe('  + resource "aws_s3_bucket" "assets" {');
    });

    test('stripAnsi removes colour codes but preserves brackets', () => {
        expect(stripAnsi('[32m+ create[0m')).toBe('+ create');
        expect(stripAnsi('Refreshing state... [id=ami-123]')).toBe('Refreshing state... [id=ami-123]');
    });

    test('normalizePlanText handles CRLF and trailing whitespace', () => {
        expect(normalizePlanText('a  \r\nb\r')).toEqual(['a', 'b', '']);
    });
});

describe('matchResourceHeader', () => {
    test('recognises all Terraform action verbs', () => {
        expect(matchResourceHeader('  # aws_s3_bucket.assets will be created'))
            .toEqual({ address: 'aws_s3_bucket.assets', action: 'create' });
        expect(matchResourceHeader('  # aws_lambda_function.api will be updated in-place'))
            .toEqual({ address: 'aws_lambda_function.api', action: 'update' });
        expect(matchResourceHeader('  # aws_sqs_queue.legacy will be destroyed'))
            .toEqual({ address: 'aws_sqs_queue.legacy', action: 'destroy' });
        expect(matchResourceHeader('  # aws_instance.web must be replaced'))
            .toEqual({ address: 'aws_instance.web', action: 'replace' });
        expect(matchResourceHeader('  # aws_instance.web is tainted, so it must be replaced'))
            .toEqual({ address: 'aws_instance.web', action: 'replace' });
        expect(matchResourceHeader('  # data.aws_ami.ubuntu will be read during apply'))
            .toEqual({ address: 'data.aws_ami.ubuntu', action: 'read' });
        expect(matchResourceHeader('  # aws_s3_bucket.existing will be imported'))
            .toEqual({ address: 'aws_s3_bucket.existing', action: 'import' });
    });

    test('supports module and indexed addresses', () => {
        expect(matchResourceHeader('  # module.network.aws_subnet.private[0] will be created'))
            .toEqual({ address: 'module.network.aws_subnet.private[0]', action: 'create' });
    });

    test('ignores non-header comment lines', () => {
        expect(matchResourceHeader('  # (because aws_sqs_queue.legacy is not in configuration)')).toBeNull();
        expect(matchResourceHeader('        # (14 unchanged attributes hidden)')).toBeNull();
        expect(matchResourceHeader('Plan: 1 to add, 0 to change, 0 to destroy.')).toBeNull();
    });
});

describe('classifyLine', () => {
    test('classifies diff symbols', () => {
        expect(classifyLine('-/+ resource "aws_instance" "web" {')).toBe('replace');
        expect(classifyLine('  + bucket = "assets"')).toBe('add');
        expect(classifyLine('  - name = "legacy" -> null')).toBe('remove');
        expect(classifyLine('  ~ memory_size = 512 -> 1024')).toBe('change');
        expect(classifyLine(' <= data "aws_ami" "ubuntu" {')).toBe('read');
        expect(classifyLine('  # (14 unchanged attributes hidden)')).toBe('comment');
        expect(classifyLine('        id = "octopub-products-api"')).toBe('context');
    });
});

describe('parsePlan on the sample log', () => {
    const parsed = parsePlan(SAMPLE_PLAN_LOG);

    test('finds all six resource changes', () => {
        expect(parsed.planFound).toBe(true);
        expect(parsed.resources).toHaveLength(6);
        expect(parsed.resources.map(r => r.action))
            .toEqual(['create', 'create', 'update', 'update', 'replace', 'destroy']);
    });

    test('captures the replacement and its forces-replacement flag', () => {
        const replaced = parsed.resources.find(r => r.action === 'replace');
        expect(replaced.address).toBe('aws_instance.web');
        expect(replaced.forcesReplacement).toBe(true);
    });

    test('captures the destroy reason comment', () => {
        const destroyed = parsed.resources.find(r => r.action === 'destroy');
        expect(destroyed.reason).toBe('because aws_sqs_queue.legacy is not in configuration');
    });

    test('extracts the Plan: summary numbers', () => {
        expect(parsed.summary.line).toBe('Plan: 3 to add, 2 to change, 2 to destroy.');
        expect(parsed.summary.add).toBe(3);
        expect(parsed.summary.change).toBe(2);
        expect(parsed.summary.destroy).toBe(2);
    });

    test('extracts output changes', () => {
        expect(parsed.outputs).toEqual([
            { symbol: '+', name: 'assets_bucket', value: '"octopub-assets-production"' },
            { symbol: '~', name: 'web_public_ip', value: '"54.206.112.87" -> (known after apply)' },
        ]);
    });

    test('captures the deprecation warning', () => {
        expect(parsed.warnings).toHaveLength(1);
        expect(parsed.warnings[0].severity).toBe('warning');
        expect(parsed.warnings[0].title).toBe('Argument is deprecated');
    });

    test('computeCounts prefers the summary line and counts replacements', () => {
        const counts = computeCounts(parsed);
        expect(counts.add).toBe(3);
        expect(counts.change).toBe(2);
        expect(counts.destroy).toBe(2);
        expect(counts.replace).toBe(1);
        expect(counts.byAction.create).toBe(2);
    });
});

describe('parsePlan edge cases', () => {
    test('parses Octopus raw logs with timestamp prefixes', () => {
        const raw = [
            '10:23:45   Info     | Terraform will perform the following actions:',
            '10:23:45   Info     |   # aws_s3_bucket.assets will be created',
            '10:23:45   Info     |   + resource "aws_s3_bucket" "assets" {',
            '10:23:45   Info     |       + bucket = "octopub-assets"',
            '10:23:45   Info     |     }',
            '10:23:46   Info     | Plan: 1 to add, 0 to change, 0 to destroy.',
        ].join('\n');

        const parsed = parsePlan(raw);
        expect(parsed.resources).toHaveLength(1);
        expect(parsed.resources[0].address).toBe('aws_s3_bucket.assets');
        expect(parsed.summary.add).toBe(1);
    });

    test('tolerates a truncated, in-progress plan (streaming)', () => {
        const partial = SAMPLE_PLAN_LOG.split('\n').slice(0, 40).join('\n');
        const parsed = parsePlan(partial);

        expect(parsed.planFound).toBe(true);
        expect(parsed.summary.line).toBeNull();
        expect(parsed.resources.length).toBeGreaterThan(0);

        // Falls back to counting parsed blocks when there is no summary line yet
        const counts = computeCounts(parsed);
        expect(counts.add).toBe(parsed.resources.filter(r => r.action === 'create').length);
    });

    test('recognises a no-changes plan', () => {
        const parsed = parsePlan('No changes. Your infrastructure matches the configuration.');
        expect(parsed.planFound).toBe(true);
        expect(parsed.noChanges).toBe('No changes. Your infrastructure matches the configuration.');
        expect(parsed.resources).toHaveLength(0);
    });

    test('recognises OpenTofu plan output', () => {
        const tofu = [
            'OpenTofu will perform the following actions:',
            '',
            '  # aws_s3_bucket.assets will be created',
            '  + resource "aws_s3_bucket" "assets" {',
            '      + bucket = "octopub-assets"',
            '    }',
            '',
            'Plan: 1 to add, 0 to change, 0 to destroy.',
        ].join('\n');

        const parsed = parsePlan(tofu);
        expect(parsed.hasPlanMarker).toBe(true);
        expect(parsed.resources).toHaveLength(1);
    });

    test('handles empty input', () => {
        const parsed = parsePlan('');
        expect(parsed.planFound).toBe(false);
        expect(parsed.resources).toHaveLength(0);
        expect(parsed.outputs).toHaveLength(0);
    });

    test('detects drift notes', () => {
        const parsed = parsePlan('Note: Objects have changed outside of Terraform');
        expect(parsed.drift).toBe(true);
    });
});

describe('pickTerraformStep', () => {
    const activityLogs = [{
        Name: 'Deploy Infrastructure release 1.2.3',
        Children: [
            {
                Name: 'Step 1: Deploy to Kubernetes',
                LogElements: [{ MessageText: 'kubectl apply -f deployment.yaml' }],
                Children: [],
            },
            {
                Name: 'Step 2: Plan to apply a Terraform template',
                LogElements: [],
                Children: [{
                    Name: 'worker-01',
                    LogElements: [
                        { MessageText: 'Terraform will perform the following actions:' },
                        { MessageText: 'Plan: 1 to add, 0 to change, 0 to destroy.' },
                    ],
                }],
            },
        ],
    }];

    test('selects the Terraform step by name and content', () => {
        const step = pickTerraformStep(activityLogs);
        expect(step.name).toBe('Step 2: Plan to apply a Terraform template');
        expect(step.text).toContain('Terraform will perform');
    });

    test('returns null when no step looks like Terraform', () => {
        const step = pickTerraformStep([{ Name: 'Task', Children: [{ Name: 'Step 1: Copy files', LogElements: [{ MessageText: 'copied 3 files' }], Children: [] }] }]);
        expect(step).toBeNull();
    });

    test('returns all plan-like steps in process order when scores tie', () => {
        const planText = [
            'Terraform will perform the following actions:',
            'Plan: 1 to add, 0 to change, 0 to destroy.',
        ];
        const twoStepTask = [{
            Name: 'Deploy release',
            Children: [
                { Name: 'Plan to apply a Terraform template', LogElements: planText.map(t => ({ MessageText: t })), Children: [] },
                { Name: 'Simulated Terraform plan (streaming demo)', LogElements: planText.map(t => ({ MessageText: t })), Children: [] },
            ],
        }];

        const candidates = pickTerraformSteps(twoStepTask);
        expect(candidates).toHaveLength(2);
        expect(candidates[0].name).toBe('Plan to apply a Terraform template');
        expect(candidates[1].name).toBe('Simulated Terraform plan (streaming demo)');
        expect(pickTerraformStep(twoStepTask).name).toBe('Plan to apply a Terraform template');
    });
});

describe('deployment history helpers', () => {
    test('buildNameMap maps ids to names and tolerates gaps', () => {
        expect(buildNameMap([
            { Id: 'Environments-1', Name: 'Production' },
            { Id: 'Environments-2' },
            null,
        ])).toEqual({ 'Environments-1': 'Production', 'Environments-2': 'Environments-2' });
        expect(buildNameMap(undefined)).toEqual({});
    });

    test('buildVersionMap maps release ids to versions', () => {
        expect(buildVersionMap([{ Id: 'Releases-1', Version: '1.2.3' }, { Id: 'Releases-2' }]))
            .toEqual({ 'Releases-1': '1.2.3', 'Releases-2': null });
    });

    test('buildTaskMap captures state and pending interruptions', () => {
        expect(buildTaskMap([
            { Id: 'ServerTasks-1', State: 'Success' },
            { Id: 'ServerTasks-2', State: 'Executing', HasPendingInterruptions: true },
        ])).toEqual({
            'ServerTasks-1': { state: 'Success', awaitingIntervention: false },
            'ServerTasks-2': { state: 'Executing', awaitingIntervention: true },
        });
    });

    test('describeDeployment flattens a deployment with all lookups present', () => {
        const row = describeDeployment(
            {
                Id: 'Deployments-42',
                Name: 'Deploy to Production',
                TaskId: 'ServerTasks-7',
                ReleaseId: 'Releases-1',
                EnvironmentId: 'Environments-1',
                Created: '2026-08-15T10:30:00Z',
            },
            {
                versions: { 'Releases-1': '1.2.3' },
                environments: { 'Environments-1': 'Production' },
                tasks: { 'ServerTasks-7': { state: 'Executing', awaitingIntervention: true } },
            });

        expect(row).toEqual({
            deploymentId: 'Deployments-42',
            taskId: 'ServerTasks-7',
            name: 'Deploy to Production',
            version: '1.2.3',
            environmentName: 'Production',
            created: '2026-08-15T10:30:00Z',
            state: 'Executing',
            awaitingIntervention: true,
        });
    });

    test('describeDeployment degrades gracefully with missing lookups', () => {
        const row = describeDeployment(
            { Id: 'Deployments-1', ReleaseId: 'Releases-9', EnvironmentId: 'Environments-9' },
            {});

        expect(row.taskId).toBeNull();
        expect(row.version).toBeNull();
        expect(row.environmentName).toBe('Environments-9');
        expect(row.state).toBeNull();
        expect(row.awaitingIntervention).toBe(false);
    });

    test('relativeAge formats ages across units', () => {
        const now = Date.parse('2026-08-17T12:00:00Z');
        expect(relativeAge('2026-08-17T11:59:40Z', now)).toBe('just now');
        expect(relativeAge('2026-08-17T11:45:00Z', now)).toBe('15 min ago');
        expect(relativeAge('2026-08-17T09:00:00Z', now)).toBe('3 hours ago');
        expect(relativeAge('2026-08-15T12:00:00Z', now)).toBe('2 days ago');
        expect(relativeAge('2026-06-01T12:00:00Z', now)).toBe('2 months ago');
        expect(relativeAge('2024-08-17T12:00:00Z', now)).toBe('2 years ago');
        expect(relativeAge('not a date', now)).toBe('');
    });
});

describe('filterMatches', () => {
    test('all matches every action', () => {
        for (const action of ['create', 'update', 'destroy', 'replace', 'read', 'import']) {
            expect(filterMatches(action, 'all')).toBe(true);
        }
    });

    test('chip filters match a single action', () => {
        expect(filterMatches('create', 'create')).toBe(true);
        expect(filterMatches('replace', 'create')).toBe(false);
        expect(filterMatches('replace', 'replace')).toBe(true);
    });

    test('tile filters mirror the Plan: line, where replacements count in add and destroy', () => {
        expect(filterMatches('create', 'tile-add')).toBe(true);
        expect(filterMatches('replace', 'tile-add')).toBe(true);
        expect(filterMatches('update', 'tile-add')).toBe(false);

        expect(filterMatches('update', 'tile-change')).toBe(true);
        expect(filterMatches('replace', 'tile-change')).toBe(false);

        expect(filterMatches('destroy', 'tile-destroy')).toBe(true);
        expect(filterMatches('replace', 'tile-destroy')).toBe(true);
        expect(filterMatches('create', 'tile-destroy')).toBe(false);
    });
});

describe('filterRowsByDate', () => {
    const rows = [
        { deploymentId: 'a', created: '2026-08-01T09:00:00' },
        { deploymentId: 'b', created: '2026-08-10T09:00:00' },
        { deploymentId: 'c', created: '2026-08-15T23:59:00' },
        { deploymentId: 'd', created: null },
    ];
    const ids = filtered => filtered.map(r => r.deploymentId);

    test('returns everything when no range is set', () => {
        expect(filterRowsByDate(rows, '', '')).toHaveLength(4);
        expect(filterRowsByDate(undefined, '', '')).toEqual([]);
    });

    test('applies from and to bounds with an inclusive to-day', () => {
        expect(ids(filterRowsByDate(rows, '2026-08-05', ''))).toEqual(['b', 'c', 'd']);
        expect(ids(filterRowsByDate(rows, '', '2026-08-10'))).toEqual(['a', 'b', 'd']);
        expect(ids(filterRowsByDate(rows, '2026-08-10', '2026-08-15'))).toEqual(['b', 'c', 'd']);
    });

    test('keeps rows with missing or unparseable dates', () => {
        expect(ids(filterRowsByDate([{ deploymentId: 'x', created: 'garbage' }], '2026-08-01', '2026-08-02')))
            .toEqual(['x']);
    });
});

describe('extractPendingInterruption', () => {
    test('returns the title and paragraph instructions of the pending interruption', () => {
        const summary = extractPendingInterruption([
            {
                Id: 'Interruptions-1',
                IsPending: true,
                Title: 'Approve the Terraform plan',
                Form: {
                    Elements: [
                        { Name: 'Instructions', Control: { Type: 'Paragraph', Text: 'Review the plan output above.' } },
                        { Name: 'Notes', Control: { Type: 'TextArea', Label: 'Notes' } },
                        { Name: 'Result', Control: { Type: 'SubmitButtonGroup', Buttons: [] } },
                    ],
                },
            },
        ]);

        expect(summary).toEqual({
            id: 'Interruptions-1',
            title: 'Approve the Terraform plan',
            instructions: 'Review the plan output above.',
        });
    });

    test('returns null when there are no pending interruptions', () => {
        expect(extractPendingInterruption([])).toBeNull();
        expect(extractPendingInterruption(undefined)).toBeNull();
        expect(extractPendingInterruption([{ Id: 'Interruptions-2', IsPending: false }])).toBeNull();
    });

    test('tolerates interruptions without a form', () => {
        expect(extractPendingInterruption([{ Id: 'Interruptions-3', IsPending: true }]))
            .toEqual({ id: 'Interruptions-3', title: 'Manual intervention', instructions: '' });
    });
});

describe('markdown parsing', () => {
    test('parseInline handles code spans, bold, and italic', () => {
        expect(parseInline('replace `aws_instance.web` with **caution**, *please*')).toEqual([
            { type: 'text', text: 'replace ' },
            { type: 'code', text: 'aws_instance.web' },
            { type: 'text', text: ' with ' },
            { type: 'bold', text: 'caution' },
            { type: 'text', text: ', ' },
            { type: 'italic', text: 'please' },
        ]);
    });

    test('parseInline treats plain text as a single segment', () => {
        expect(parseInline('no formatting here')).toEqual([{ type: 'text', text: 'no formatting here' }]);
        expect(parseInline('')).toEqual([]);
    });

    test('parseMarkdownBlocks splits headings, paragraphs, and lists', () => {
        const blocks = parseMarkdownBlocks([
            '## Destructive actions',
            '',
            'Two resources are affected.',
            '',
            '- `aws_instance.web` is replaced',
            '- `aws_sqs_queue.legacy` is destroyed',
            '',
            '1. verify the queue is drained',
            '2. approve',
        ].join('\n'));

        expect(blocks).toEqual([
            { type: 'heading', text: 'Destructive actions' },
            { type: 'paragraph', text: 'Two resources are affected.' },
            { type: 'list', ordered: false, items: ['`aws_instance.web` is replaced', '`aws_sqs_queue.legacy` is destroyed'] },
            { type: 'list', ordered: true, items: ['verify the queue is drained', 'approve'] },
        ]);
    });

    test('parseMarkdownBlocks collapses blank runs and joins wrapped lines', () => {
        const blocks = parseMarkdownBlocks('line one\nline two\n\n\n\nnext paragraph');
        expect(blocks).toEqual([
            { type: 'paragraph', text: 'line one line two' },
            { type: 'paragraph', text: 'next paragraph' },
        ]);
    });

    test('parseMarkdownBlocks attaches wrapped continuation lines to list items', () => {
        const blocks = parseMarkdownBlocks('- first item that\n  wraps onto a second line\n- second item');
        expect(blocks).toEqual([
            { type: 'list', ordered: false, items: ['first item that wraps onto a second line', 'second item'] },
        ]);
    });

    test('parseMarkdownBlocks handles empty input', () => {
        expect(parseMarkdownBlocks('')).toEqual([]);
        expect(parseMarkdownBlocks(undefined)).toEqual([]);
    });
});

describe('buildAiPrompt', () => {
    test('includes context and the plan summary', () => {
        const parsed = parsePlan(SAMPLE_PLAN_LOG);
        const prompt = buildAiPrompt(parsed, { space: 'Platform', project: 'Infrastructure' });

        expect(prompt).toContain('The current space is "Platform".');
        expect(prompt).toContain('The current project is "Infrastructure".');
        expect(prompt).toContain('Plan: 3 to add, 2 to change, 2 to destroy.');
    });

    test('truncates very large plans', () => {
        const bigLine = '  + bucket = "x"';
        const big = ['  # aws_s3_bucket.assets will be created']
            .concat(Array(2000).fill(bigLine))
            .join('\n');

        const prompt = buildAiPrompt(parsePlan(big), {});
        expect(prompt).toContain('... (truncated)');
    });
});
