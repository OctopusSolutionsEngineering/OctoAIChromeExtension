function dashboardGetConfig(callback) {
    chrome.storage.local.get("dashboardConfig", config => callback(config.dashboardConfig));
}
