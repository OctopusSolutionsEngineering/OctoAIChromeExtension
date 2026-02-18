// A regex that matches the ui of an Octopus server
const OctopusServerUrlRegex = /https?:\/\/.+?\/app#\/Spaces-.*/

// Some of the more complex queries, like building project Terraform, can take a while.
// So we need a generous timeout.
const Timeout = 8 * 60 * 1000 // 8 minutes

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
                            })
                            .then(() => chrome.scripting.executeScript({
                                target: {tabId: tab.id},
                                files: ['purify.min.js']
                            }));

                            chrome.scripting.executeScript({ 
                                target: {tabId: tab.id},
                                files: ['scripts/utils.js']
                            })
                            .then(() => chrome.scripting.executeScript({ 
                                target: {tabId: tab.id},
                                files: ['scripts/dashboard.js']
                            }))
                            .then(() => chrome.scripting.executeScript({
                                target: {tabId: tab.id},
                                files: ['scripts/ui.js']
                            }))
                            .then(() => chrome.scripting.executeScript({ 
                                target: {tabId: tab.id},
                                files: ['scripts/api.js']
                            }))
                            .then(() => chrome.scripting.executeScript({ 
                                target: {tabId: tab.id},
                                files: ['scripts/context.js']
                            }))
                            .then(() => chrome.scripting.executeScript({ 
                                target: {tabId: tab.id},
                                files: ['scripts/prompts.js']
                            }))
                            .then(() => chrome.scripting.executeScript({ 
                                target: {tabId: tab.id},
                                files: ['content.js']
                            }))
                            .catch(err => console.error('Error injecting scripts:', err)); 
                            
                        } catch (e) { 
                            console.error('Synchronous error during script injection setup:', e);
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
        } else if (request.action === 'confirmation') {
            callOctoAIAPIConfirmation(request, sendResponse, 0)
        } else if (request.action === 'feedback') {
            addFeedback(request)
            sendResponse({ok: true});
        } else if (request.action === 'getPrompts') {
            fetch('https://raw.githubusercontent.com/OctopusSolutionsEngineering/OctoAIChromeExtension/main/promptsv4.json')
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`OctoAI API call failed: ${response.status} ${response.statusText}`);
                    }
                    return response.json()
                })
                .then(json => sendResponse({response: json}))
                .catch(error => {
                    sendResponse({error: error, prompt: request.prompt})
                });
        } else if (request.action === 'showDashboard') {
            showDashboard(request);
            sendResponse({ok: true});
        }

        return true;
    }
);

function showDashboard(request) {
    if (!validateFilename(request.dashboardFile)) {
        console.error("Invalid dashboard filename: " + request.dashboardFile);
        return;
    }

    chrome.storage.local.get("dashboardConfig", config => {
        // Get the correctly shaped dashboardConfig, ensuring we don't overwrite existing serverUrls
        const dashboardConfig = config && config.dashboardConfig || {};
        dashboardConfig.serverUrls = dashboardConfig.serverUrls || [];

        // Get a unique list of server URLs, including the new one from the request
        const serverUrls = [...dashboardConfig.serverUrls, request.lastServerUrl];
        dashboardConfig.serverUrls = [...new Set(serverUrls)].filter(url => url); // Remove any falsy values

        // Note the server that was used to launch the dashboard, so we can use it as the default in the dashboard UI
        dashboardConfig.lastServerUrl = request.lastServerUrl;

        // This is the context from which the dashboard was launched
        dashboardConfig.context = request.context;

        // Save the updated dashboardConfig back to storage, then open the dashboard in a new tab
        chrome.storage.local.set({"dashboardConfig": dashboardConfig}, () => {
            chrome.tabs.create({
                url: chrome.runtime.getURL("dashboards/" + request.dashboardFile)
            });
        });
    });
}

function validateFilename(filename) {
    // Must be in subdirectory and called index.html
    return filename.match(/^[a-z][a-z0-9]+\/index.html$/);
}

function addFeedback(request) {
    const headers= {
        'Authorization': `Bearer ${request.accessToken}`,
        'X-Octopus-Url': request.serverUrl,
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

function callOctoAIAPIConfirmation(request, sendResponse, count) {
    buildHeaders(request)
        .then(headers =>
            fetch('https://aiagent.octopus.com/api/form_handler?confirmation_id=' + encodeURIComponent(request.id) + '&confirmation_state=accepted', {
                method: 'POST',
                headers: headers,
                signal: AbortSignal.timeout(Timeout)
            })
        )
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
                callOctoAIAPIConfirmation(request, sendResponse, count + 1)
            }
        });
}

function callOctoAIAPI(request, sendResponse, count) {
    buildHeaders(request)
        .then(headers =>
            fetch('https://aiagent.octopus.com/api/form_handler', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({"messages": [{"content": request.prompt}]}),
                signal: AbortSignal.timeout(Timeout)
            })
        )
        .then(response => {
            if (!response.ok) {
                throw new Error(`OctoAI API call failed: ${response.status} ${response.statusText}`);
            }
            return response.text()
        })
        .then(text => {
            sendResponse({response: text, prompt: request.prompt})
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
    return chrome.storage.local.get(["apiKey", "rules", "enableRedirect"])
        .then(data => {
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

                if (data.enableRedirect && data.apiKey && data.rules) {
                    headers['X_REDIRECTION_REDIRECTIONS'] = data.rules;
                    headers['X_REDIRECTION_API_KEY'] = data.apiKey;
                }

                return headers;
            }
        )
}