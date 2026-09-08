function onChange() {
    const apiKey = document.getElementById("apikey");
    const rules = document.getElementById("rules");
    const enableRedirect = document.getElementById("enableRedirect");
    const disableAnalytics = document.getElementById("disableAnalytics");
    chrome.storage.local.set({ apiKey: apiKey.value, rules: rules.value, enableRedirect: enableRedirect.checked, disableAnalytics: disableAnalytics.checked });
}

function onLoad() {
    document.getElementById("apikey").onchange = onChange;
    document.getElementById("rules").onchange = onChange;
    document.getElementById("enableRedirect").onchange = onChange;
    document.getElementById("disableAnalytics").onchange = onChange;

    chrome.storage.local.get("apiKey", data => {
        if (data.apiKey) {
            document.getElementById("apikey").value = data.apiKey;
        }
    })

    chrome.storage.local.get("rules", data => {
        if (data.rules) {
            document.getElementById("rules").value = data.rules;
        }
    })

    chrome.storage.local.get("enableRedirect", data => {
        if (data.enableRedirect) {
            document.getElementById("enableRedirect").checked = data.enableRedirect;
        }
    })

    // Analytics are enabled unless the user opts out, so an unset value leaves the box unchecked.
    chrome.storage.local.get("disableAnalytics", data => {
        document.getElementById("disableAnalytics").checked = !!data.disableAnalytics;
    })
}

onLoad();