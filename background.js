chrome.action.onClicked.addListener((tab) => {

});

chrome.tabs.onUpdated.addListener( function (tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete') {
        chrome.tabs.query({windowId: tab.windowId})
            .then(tabs => {
                tabs.forEach(tab => {
                    if (tab.url.match(/https:\/\/.+?\.octopus\.app\/.*/)) {
                        try {
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
