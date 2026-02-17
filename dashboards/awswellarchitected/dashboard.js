dashboardGetConfig(config => {
    dashboardSendPrompt("What is an octopus project", config.serverUrl)
        .then(result => document.body.innerText = result.response)
})