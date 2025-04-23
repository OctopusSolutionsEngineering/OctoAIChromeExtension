function onChange() {
    const apiKey = document.getElementById("apikey");
    const rules = document.getElementById("rules");
    chrome.storage.local.set({ apiKey: apiKey.value, rules: rules.value });
}

function onLoad() {
    document.getElementById("apikey").onchange = onChange;
    document.getElementById("rules").onchange = onChange;

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
}

onLoad();