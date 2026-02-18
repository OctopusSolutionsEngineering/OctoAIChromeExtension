async function displayDashboard(dashboard) {
    const serverUrl = window.location.origin;
    getUIContext()
        .then(context =>
            chrome.runtime.sendMessage({
                action: "showDashboard",
                dashboardFile: dashboard,
                serverUrl: serverUrl,
                context: context
            })
        )
        .catch(error => alert("Error showing dashboard: " + error));
}

/**
 * Capture the details of the page that is currently open
 */
async function getUIContext() {
    return {
        "space": await getSpaceName(),
        "project": await getProjectName(),
        "deployment": await getDeploymentId(),
        "runbook_run": await getRunbookRun(),
        "release_version": await getReleaseVersion(),
        "step": await getStepName(),
        "tenant": await getTenantName(),
        "library_variable_set": await getLibraryVariableSet(),
        "machine": await getMachine(),
        "account": await getAccount(),
        "environment": await getEnvironment(),
        "worker": await getWorker(),
        "worker_pool": await getWorkerPool(),
        "certificate": await getCertificate(),
        "feed": await getFeed(),
        "git_credential": await getGitCredential(),
        "lifecycle": await getLifecycle(),
        "runbook": await getRunbookName(),
    }
}