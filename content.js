function watchForChange() {
    window.onhashchange = function () {
        const existingContainer = document.getElementById('octoai-container');

        if (existingContainer) {
            getSamplePrompts()
                .then(prompts => displayExamples(prompts, null, getColors()));
        }
    }
}

Logger.info("Loaded")
addAiToPage(getColors())
watchForChange()
