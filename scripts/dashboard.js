async function displayDashboard(dashboard) {
    createOctopusApiKey()
        .then(creds => chrome.runtime.sendMessage({
            action: "dashboard",
            dashboard: dashboard,
            accessToken: creds.accessToken
        }))
}