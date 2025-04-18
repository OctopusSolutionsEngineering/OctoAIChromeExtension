// A regex that matches the ui of an Octopus server
const OctopusServerUrlRegex = /https:\/\/.+?\/app#\/Spaces-.*/

chrome.action.onClicked.addListener((tab) => {

});

chrome.tabs.onUpdated.addListener( function (tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete') {
        chrome.tabs.query({windowId: tab.windowId})
            .then(tabs => {
                tabs.forEach(tab => {
                    if (tab.url.match(OctopusServerUrlRegex)) {
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
            callOctoAIAPI(request, sendResponse, 0)
        } else if (request.action == 'feedback') {
            addFeedback(request)
        } else if (request.action === 'getPrompts') {
            fetch('https://raw.githubusercontent.com/OctopusSolutionsEngineering/OctoAIChromeExtension/main/promptsv2.json')
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

function addFeedback(request) {
    const headers= {
        'Authorization': `Bearer ${request.accessToken}`,
    }

    const feedback = {
        "data": {
            "type": "feedback",
            "attributes": {
                "prompt": request.prompt,
                "comment": request.comment,
                "thumbsUp": request.thumbsUp,
            },
        }
    }

    fetch('https://feedback-fsevb4dmecepamh0.a02.azurefd.net/api/feedback', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(feedback)
    })
        .catch(error => {
            // Oh well, this is just a best effort
            console.log(error)
        });
}

function callOctoAIAPI(request, sendResponse, count) {
    const headers = buildHeaders(request)

    fetch('https://aiagent.octopus.com/api/form_handler', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({"messages": [{"content": request.prompt}]}),
        signal: AbortSignal.timeout(60000)
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
            // retry once
            if (count >= 1) {
                sendResponse({error: error})
            } else {
                callOctoAIAPI(request, sendResponse, count + 1)
            }
        });
}

function buildHeaders(request) {
    const headers = {
        'Content-Type': 'application/json',
        'X-Octopus-Server': request.serverUrl
    }

    if (request.apiKey) {
        headers['X-Octopus-ApiKey'] = request.apiKey
    }

    if (request.accessToken) {
        headers['X-Octopus-AccessToken'] = request.accessToken
    }

    return headers
}