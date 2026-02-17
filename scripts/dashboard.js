async function displayDashboard(dashboard) {
    const serverUrl = window.location.origin;
    enrichPrompt("")
        .then(context =>
            chrome.runtime.sendMessage({
                action: "showDashboard",
                dashboardFile: dashboard,
                serverUrl: serverUrl,
                context: context
            })
        )
}