let dashboardConfig = null;
const SPINNAKER_JSON_KEY = 'spinnaker_pipelineJson';


function buildFullPrompt(spinnakerJson) {
    const promptTemplate = document.getElementById('migrationPrompt').value;
    return `${promptTemplate}\n\n# Spinnaker Pipeline Json\n\n${spinnakerJson}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    dashboardGetConfig(config => {
        dashboardConfig = config;
    });

    const migrationPrompt = document.getElementById('migrationPrompt');

    // Populate the Migration Prompt textarea from prompt.md
    try {
        const promptTemplate = await fetch('prompt.md').then(r => r.text());
        migrationPrompt.value = promptTemplate;
    } catch (e) {
        console.error('Failed to load prompt.md:', e);
    }

    const convertButton = document.getElementById('convertButton');
    const copyPromptButton = document.getElementById('copyPromptButton');
    const executeButton = document.getElementById('executeButton');
    const spinnakerInput = document.getElementById('spinnakerPipelineJson');
    const promptOutput = document.getElementById('octopusAiProjectPrompt');

    const savedJson = localStorage.getItem(SPINNAKER_JSON_KEY);
    if (savedJson) {
        spinnakerInput.value = savedJson;
    }

    spinnakerInput.addEventListener('input', () => {
        localStorage.setItem(SPINNAKER_JSON_KEY, spinnakerInput.value);
    });

    copyPromptButton.addEventListener('click', async () => {
        const spinnakerJson = spinnakerInput.value.trim();

        if (!spinnakerJson) {
            promptOutput.value = 'Please paste a Spinnaker pipeline JSON before copying.';
            return;
        }

        try {
            const fullPrompt = await buildFullPrompt(spinnakerJson);
            await navigator.clipboard.writeText(fullPrompt);
            copyPromptButton.textContent = 'Copied!';
            setTimeout(() => { copyPromptButton.textContent = 'Copy Prompt'; }, 2000);
        } catch (e) {
            promptOutput.value = 'An error occurred while copying the prompt. Please try again.';
        }
    });

    convertButton.addEventListener('click', async () => {
        const spinnakerJson = spinnakerInput.value.trim();

        if (!spinnakerJson) {
            promptOutput.value = 'Please paste a Spinnaker pipeline JSON before converting.';
            return;
        }

        convertButton.disabled = true;
        executeButton.disabled = true;
        promptOutput.value = 'Converting...';

        try {
            const fullPrompt = await buildFullPrompt(spinnakerJson);
            const serverUrl = dashboardConfig?.lastServerUrl;

            const result = await dashboardSendPrompt(fullPrompt, serverUrl);

            promptOutput.value = result.response;

            if (result.state !== 'Error') {
                executeButton.disabled = false;
            }
        } catch (e) {
            promptOutput.value = 'An error occurred while converting the pipeline. Please try again.';
        } finally {
            convertButton.disabled = false;
        }
    });
});
