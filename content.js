function arrayNotNullOrEmpty(array) {
    if (!array) {
        return null
    }

    return array.length > 0 ? array : null
}


function watchForChange() {
    window.onhashchange = function () {
        const existingContainer = document.getElementById('octoai-container');

        if (existingContainer) {
            getSamplePrompts()
                .then(prompts => displayExamples(prompts, getColors()));
        }
    }
}

console.log("Loaded OctoAI")
addAiToPage(getColors())
watchForChange()
