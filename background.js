chrome.action.onClicked.addListener((tab) => {

});

chrome.tabs.onUpdated.addListener( function (tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete') {
        chrome.tabs.query({windowId: tab.windowId})
            .then(tabs => {
                tabs.forEach(tab => {
                    if (tab.url.match(/https:\/\/.+?\.octopus\.app\/app#\/Spaces-.*/)) {
                        try {
                            chrome.scripting.executeScript({
                                target: {tabId: tab.id},
                                files: ['marked.min.js']
                            });
                            chrome.scripting.executeScript({
                                target: {tabId: tab.id},
                                files: ['purify.min.js']
                            });
                            chrome.scripting.executeScript({
                                target: {tabId: tab.id},
                                files: ['content.js']
                            });
                        } catch {
                            // probably an invalid URL
                        }
                    }
                })
            })
    }
})

chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {

        if (request.action === 'prompt') {
            fetch('https://aiagent.octopus.com/api/form_handler', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Octopus-AccessToken': request.accessToken,
                    'X-Octopus-Server': request.serverUrl
                },
                body: JSON.stringify({"messages": [{"content": request.prompt}]})
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`OctoAI API call failed: ${response.status} ${response.statusText}`);
                    }
                    return response.text()
                })
                .then(text => {
                    sendResponse({response: text})
                })
                .catch(error => {
                    sendResponse({error: error})
                });
        } else if (request.action === 'getPrompts') {
            fetch('https://raw.githubusercontent.com/mcasperson/OctoAIChromeExtension/main/prompts.json')
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`OctoAI API call failed: ${response.status} ${response.statusText}`);
                    }
                    return response.json()
                })
                .then(json => sendResponse({response: json}))
                .catch(error => {
                    sendResponse({error: error})
                });
        }

        return true;
    }
);
