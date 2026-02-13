async function displayDashboard(dashboard) {
    const serverUrl = window.location.origin;

    createOctopusApiKey()
        .then(creds => chrome.runtime.sendMessage({
            action: "dashboard",
            dashboardFile: dashboard,
            accessToken: creds.accessToken,
            serverUrl: serverUrl
        }))
}