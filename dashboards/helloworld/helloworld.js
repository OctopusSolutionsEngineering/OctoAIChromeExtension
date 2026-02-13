getDashboardConfig(config => {
    document.getElementById("server").innerText = `Server: ${config.serverUrl}`;
})