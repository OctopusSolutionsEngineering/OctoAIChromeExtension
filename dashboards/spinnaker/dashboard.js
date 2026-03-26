let dashboardConfig = null;
const SPINNAKER_JSON_KEY = 'spinnaker_pipelineJson';
const SPINNAKER_MIGRATION_PROMPT_KEY = 'spinnaker_migrationPrompt';


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

    migrationPrompt.disabled = locked;
    migrationPrompt.readOnly = locked;
    spinnakerInput.disabled = locked;
    spinnakerInput.readOnly = locked;
    promptOutput.readOnly = locked;
    convertButton.disabled = locked;
    copyPromptButton.disabled = locked;
    executeButton.disabled = locked;
}

function extractMarkdownCodeBlock(text) {
    const match = text.match(/```[^\n]*\n([\s\S]*?)```/);
    return match ? match[1].trim() : text;
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
        setTimeout(() => { copyPromptButton.textContent = 'Copy Prompt'; }, 2000);
    } catch (e) {
        promptOutput.value = 'An error occurred while copying the prompt. Please try again.';
    }
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
        const fullPrompt = buildFullPrompt(spinnakerJson);
        const serverUrl = dashboardConfig?.lastServerUrl;

        const result = await dashboardSendPrompt(fullPrompt, serverUrl);

        promptOutput.value = extractMarkdownCodeBlock(result.response);

        if (result.state !== 'Error') {
            convertSucceeded = true;
        }
    } catch (e) {
        promptOutput.value = 'An error occurred while converting the pipeline. Please try again.';
    } finally {
        setFieldsLocked(false);
        promptOutput.readOnly = !convertSucceeded;
        executeButton.disabled = !convertSucceeded;
    }
}

async function onExecute() {
    const promptOutput = document.getElementById('octopusAiProjectPrompt');
    const executeButton = document.getElementById('executeButton');
    const prompt = promptOutput.value.trim();

    if (!prompt) {
        return;
    }

    setFieldsLocked(true);

    try {
        const serverUrl = dashboardConfig?.lastServerUrl;
        const result = await dashboardSendPrompt(prompt, serverUrl);

        promptOutput.value = result.response;

        if (result.state === 'Error') {
            promptOutput.readOnly = true;
            executeButton.disabled = true;
        }
    } catch (e) {
        promptOutput.value = 'An error occurred while executing the prompt. Please try again.';
    } finally {
        setFieldsLocked(false);
    }
}

function initSpinnakerInput() {
    const spinnakerInput = document.getElementById('spinnakerPipelineJson');

    const savedJson = localStorage.getItem(SPINNAKER_JSON_KEY);
    if (savedJson) {
        spinnakerInput.value = savedJson;
    }

    spinnakerInput.addEventListener('input', () => {
        localStorage.setItem(SPINNAKER_JSON_KEY, spinnakerInput.value);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    dashboardGetConfig(config => {
        dashboardConfig = config;
    });

    await initMigrationPrompt();
    initSpinnakerInput();

    const convertButton = document.getElementById('convertButton');
    const copyPromptButton = document.getElementById('copyPromptButton');
    const executeButton = document.getElementById('executeButton');

    copyPromptButton.addEventListener('click', onCopyPrompt);
    convertButton.addEventListener('click', onConvert);
    executeButton.addEventListener('click', onExecute);
});
