async function displayDashboard(dashboard) {
    const serverUrl = window.location.origin;

    chrome.runtime.sendMessage({
        action: "showDashboard",
        dashboardFile: dashboard,
        serverUrl: serverUrl
    })
}