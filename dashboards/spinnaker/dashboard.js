let dashboardConfig = null;
let spaceName = 'Unknown';
const SPINNAKER_JSON_KEY = 'spinnaker_pipelineJson';
const SPINNAKER_MIGRATION_PROMPT_KEY = 'spinnaker_migrationPrompt';
const SPINNAKER_AUTO_APPROVE_KEY = 'spinnaker_autoApprove';
const SECTION_SEPARATOR = '\n\n---\n\n';


function buildFullPrompt(spinnakerJson) {
    const promptTemplate = document.getElementById('migrationPrompt').value;
    return `${promptTemplate}\n\n# Spinnaker Pipeline Json\n\n${spinnakerJson}`;
}

function setFieldsLocked(locked) {
    const migrationPrompt = document.getElementById('migrationPrompt');
    const spinnakerInput = document.getElementById('spinnakerPipelineJson');
    const promptOutput = document.getElementById('octopusAiProjectPrompt');
    const convertButton = document.getElementById('convertButton');
    const copyPromptButton = document.getElementById('copyPromptButton');
    const executeButton = document.getElementById('executeButton');
    const copyProjectPromptButton = document.getElementById('copyProjectPromptButton');
    const autoApproveCheckbox = document.getElementById('autoApproveCheckbox');

    migrationPrompt.disabled = locked;
    migrationPrompt.readOnly = locked;
    spinnakerInput.disabled = locked;
    spinnakerInput.readOnly = locked;
    promptOutput.readOnly = locked;
    convertButton.disabled = locked;
    copyPromptButton.disabled = locked;
    executeButton.disabled = locked;
    copyProjectPromptButton.disabled = locked;
    autoApproveCheckbox.disabled = locked;
}

function updateSectionCount(text) {
    const count = text.trim()
        ? text.trim().split(SECTION_SEPARATOR).length
        : 0;
    const label = count === 1 ? 'section' : 'sections';
    document.getElementById('sectionCount').textContent =
        count > 0 ? `${count} ${label}` : '';
}

function updatePipelineCount(text) {
    const el = document.getElementById('pipelineCount');
    if (!text.trim()) {
        el.textContent = '';
        return;
    }
    try {
        const parsed = JSON.parse(text);
        const count = Array.isArray(parsed) ? parsed.length : 1;
        const label = count === 1 ? 'pipeline' : 'pipelines';
        el.textContent = `${count} ${label}`;
    } catch {
        el.textContent = '';
    }
}

function extractMarkdownCodeBlock(text) {
    const match = text.match(/```[^\n]*\n([\s\S]*?)```/);
    return match ? match[1].trim() : text;
}

function deduplicateSections(text) {
    const sections = text.split(SECTION_SEPARATOR);
    const seen = new Set();
    const unique = sections.filter(section => {
        const key = section.trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return unique.join(SECTION_SEPARATOR);
}

async function initMigrationPrompt() {
    const migrationPrompt = document.getElementById('migrationPrompt');

    try {
        const savedPrompt = localStorage.getItem(SPINNAKER_MIGRATION_PROMPT_KEY);
        if (savedPrompt) {
            migrationPrompt.value = savedPrompt;
        } else {
            migrationPrompt.value = await fetch('prompt.md').then(r => r.text());
        }
    } catch (e) {
        console.error('Failed to load prompt.md:', e);
    }

    migrationPrompt.addEventListener('input', () => {
        if (migrationPrompt.value.trim()) {
            localStorage.setItem(SPINNAKER_MIGRATION_PROMPT_KEY, migrationPrompt.value);
        }
    });
}

async function onCopyProjectPrompt() {
    const promptOutput = document.getElementById('octopusAiProjectPrompt');
    const copyProjectPromptButton = document.getElementById('copyProjectPromptButton');
    const text = promptOutput.value.trim();

    if (!text) {
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        copyProjectPromptButton.textContent = 'Copied!';
        setTimeout(() => { copyProjectPromptButton.textContent = 'Copy Project Prompt'; }, 2000);
    } catch (e) {
        console.error('Failed to copy project prompt:', e);
    }
}

async function onCopyPrompt() {
    const spinnakerInput = document.getElementById('spinnakerPipelineJson');
    const promptOutput = document.getElementById('octopusAiProjectPrompt');
    const copyPromptButton = document.getElementById('copyPromptButton');
    const spinnakerJson = spinnakerInput.value.trim();

    if (!spinnakerJson) {
        promptOutput.value = 'Please paste a Spinnaker pipeline JSON before copying.';
        return;
    }

    try {
        const fullPrompt = buildFullPrompt(spinnakerJson);
        await navigator.clipboard.writeText(fullPrompt);
        copyPromptButton.textContent = 'Copied!';
        setTimeout(() => { copyPromptButton.textContent = 'Copy Conversion Prompt'; }, 2000);
    } catch (e) {
        promptOutput.value = 'An error occurred while copying the prompt. Please try again.';
    }
}

async function convertSingle(spinnakerJson, serverUrl) {
    const fullPrompt = buildFullPrompt(spinnakerJson);
    const result = await dashboardSendPrompt(fullPrompt, serverUrl);
    if (result.state === 'Error') {
        throw new Error(result.response);
    }
    return extractMarkdownCodeBlock(result.response);
}

async function onConvert() {
    const spinnakerInput = document.getElementById('spinnakerPipelineJson');
    const promptOutput = document.getElementById('octopusAiProjectPrompt');
    const executeButton = document.getElementById('executeButton');
    const spinnakerJson = spinnakerInput.value.trim();

    if (!spinnakerJson) {
        promptOutput.value = 'Please paste a Spinnaker pipeline JSON before converting.';
        return;
    }

    setFieldsLocked(true);
    promptOutput.value = 'Converting...';
    let convertSucceeded = false;

    try {
        const serverUrl = dashboardConfig?.lastServerUrl;
        let parsed;

        try {
            parsed = JSON.parse(spinnakerJson);
        } catch {
            parsed = null;
        }

        if (Array.isArray(parsed)) {
            const results = [];
            for (let i = 0; i < parsed.length; i++) {
                promptOutput.value = `Converting element ${i + 1} of ${parsed.length}...`;
                const elementJson = JSON.stringify(parsed[i], null, 2);
                results.push(await convertSingle(elementJson, serverUrl));
            }
            promptOutput.value = deduplicateSections(results.join(SECTION_SEPARATOR));
        } else {
            promptOutput.value = deduplicateSections(await convertSingle(spinnakerJson, serverUrl));
        }

        updateSectionCount(promptOutput.value);
        convertSucceeded = true;
    } catch (e) {
        promptOutput.value = e.message || 'An error occurred while converting the pipeline. Please try again.';
    } finally {
        setFieldsLocked(false);
        promptOutput.readOnly = !convertSucceeded;
        executeButton.disabled = !convertSucceeded;
        document.getElementById('copyProjectPromptButton').disabled = !convertSucceeded;
    }
}

function showView(id) {
    document.getElementById('inputSection').style.display    = id === 'inputSection'    ? 'flex'   : 'none';
    document.getElementById('confirmationView').style.display = id === 'confirmationView' ? 'flex'   : 'none';
    document.getElementById('loadingView').style.display      = id === 'loadingView'      ? 'block'  : 'none';
    document.getElementById('failureView').style.display      = id === 'failureView'      ? 'flex'   : 'none';
}

function showFailure(message) {
    document.getElementById('failureText').value = message;
    document.getElementById('failureOkButton').onclick = () => {
        showView('inputSection');
        setFieldsLocked(false);
    };
    showView('failureView');
}

function showConfirmation(result, serverUrl, onApprove, onReject) {
    const autoApprove = localStorage.getItem(SPINNAKER_AUTO_APPROVE_KEY) === 'true';

    if (autoApprove) {
        showView('loadingView');
        dashboardApprovePrompt(result.id, serverUrl)
            .then(approvalResult => {
                if (approvalResult.state === 'Error') {
                    showFailure(approvalResult.response);
                } else {
                    onApprove();
                }
            })
            .catch(() => showFailure('An error occurred while auto-approving. Please try again.'));
        return;
    }

    const confirmationText = document.getElementById('confirmationText');
    const approveButton = document.getElementById('approveButton');
    const rejectButton = document.getElementById('rejectButton');

    confirmationText.value = result.response;
    showView('confirmationView');

    // Auto-reject after 4 minutes
    const confirmationTimeout = setTimeout(() => onReject(), 240000);

    approveButton.onclick = async () => {
        clearTimeout(confirmationTimeout);
        showView('loadingView');

        try {
            const approvalResult = await dashboardApprovePrompt(result.id, serverUrl);
            if (approvalResult.state === 'Error') {
                showFailure(approvalResult.response);
            } else {
                onApprove();
            }
        } catch (e) {
            showFailure('An error occurred while approving. Please try again.');
        }
    };

    rejectButton.onclick = () => {
        clearTimeout(confirmationTimeout);
        onReject();
    };
}

async function processSections(sections, index, serverUrl) {
    if (index >= sections.length) {
        showView('inputSection');
        setFieldsLocked(false);
        return;
    }

    const section = sections[index].trim();
    if (!section) {
        await processSections(sections, index + 1, serverUrl);
        return;
    }

    document.getElementById('loadingText').textContent =
        `Processing section ${index + 1} of ${sections.length}. This can take a few minutes, as the AI is generating many Octopus resources...`;
    showView('loadingView');

    try {
        const result = await dashboardSendPrompt(section, serverUrl);

        if (result.state === 'Error') {
            showFailure(result.response);
            return;
        }

        if (result.id) {
            showConfirmation(
                result,
                serverUrl,
                () => processSections(sections, index + 1, serverUrl),
                () => { showView('inputSection'); setFieldsLocked(false); }
            );
        } else {
            await processSections(sections, index + 1, serverUrl);
        }
    } catch (e) {
        showFailure(`An error occurred while processing section ${index + 1}. Please try again.`);
    }
}

async function onExecute() {
    const promptOutput = document.getElementById('octopusAiProjectPrompt');
    const prompt = promptOutput.value.trim();

    if (!prompt) {
        return;
    }

    setFieldsLocked(true);

    const sections = prompt
        .split(SECTION_SEPARATOR)
        .map(section => `${section.trimEnd()}\n\nThe current space is "${spaceName}"`);
    const serverUrl = dashboardConfig?.lastServerUrl;

    await processSections(sections, 0, serverUrl);
}

function initSpinnakerInput() {
    const spinnakerInput = document.getElementById('spinnakerPipelineJson');

    const savedJson = localStorage.getItem(SPINNAKER_JSON_KEY);
    if (savedJson) {
        spinnakerInput.value = savedJson;
        updatePipelineCount(savedJson);
    }

    spinnakerInput.addEventListener('input', () => {
        localStorage.setItem(SPINNAKER_JSON_KEY, spinnakerInput.value);
        updatePipelineCount(spinnakerInput.value);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    dashboardGetConfig(config => {
        dashboardConfig = config;
        spaceName = config.context.space || 'Unknown';
    });

    await initMigrationPrompt();
    initSpinnakerInput();

    const convertButton = document.getElementById('convertButton');
    const copyPromptButton = document.getElementById('copyPromptButton');
    const executeButton = document.getElementById('executeButton');
    const autoApproveCheckbox = document.getElementById('autoApproveCheckbox');

    autoApproveCheckbox.checked = localStorage.getItem(SPINNAKER_AUTO_APPROVE_KEY) === 'true';
    autoApproveCheckbox.addEventListener('change', () => {
        localStorage.setItem(SPINNAKER_AUTO_APPROVE_KEY, autoApproveCheckbox.checked);
    });

    copyPromptButton.addEventListener('click', onCopyPrompt);
    convertButton.addEventListener('click', onConvert);
    executeButton.addEventListener('click', onExecute);
    document.getElementById('copyProjectPromptButton').addEventListener('click', onCopyProjectPrompt);

    document.getElementById('octopusAiProjectPrompt').addEventListener('input', e => {
        updateSectionCount(e.target.value);
    });
});
