function onChange() {
    const apiKey = document.getElementById("apikey");
    const rules = document.getElementById("rules");
    const enableRedirect = document.getElementById("enableRedirect");
    chrome.storage.local.set({ apiKey: apiKey.value, rules: rules.value, enableRedirect: enableRedirect.checked });
}

function onLoad() {
    document.getElementById("apikey").onchange = onChange;
    document.getElementById("rules").onchange = onChange;
    document.getElementById("enableRedirect").onchange = onChange;

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
}

onLoad();