function refreshPrompts() {
    const existingContainer = document.getElementById('octoai-container');

    if (existingContainer) {
        getSamplePrompts()
            .then(prompts => displayExamples(prompts, null, getColors()));
    }
}

Logger.info("Loaded")
addAiToPage(getColors())

displayAIChatForEmptyProjects()
    .finally(() => refreshPrompts());


