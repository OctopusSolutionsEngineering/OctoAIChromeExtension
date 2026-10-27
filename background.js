// A regex that matches the ui of an Octopus server
const OctopusServerUrlRegex = /https?:\/\/.+?\/app#\/Spaces-.*/

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
                                files: ['scripts/utils.js']
                            })
                            .then(() => chrome.scripting.executeScript({
                                target: {tabId: tab.id},
                                files: ['scripts/ui.js']
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
