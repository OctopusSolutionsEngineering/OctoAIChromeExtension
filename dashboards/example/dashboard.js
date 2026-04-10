document.addEventListener('DOMContentLoaded', async () => {

// Initialize the dashboard
    dashboardGetConfig(async config => {
        console.log(config);

        // Dump the context we were passed
        document.getElementById("context").innerText = `
Space: ${config.context.space},
Project: ${config.context.project},
Deployment: ${config.context.deployment},
Runbook Run: ${config.context.runbook_run},
Release Version: ${config.context.release_version},
Step: ${config.context.step},
Tenant: ${config.context.tenant},
Library Variable Set: ${config.context.library_variable_set},
Machine: ${config.context.machine},
Account: ${config.context.account},
Environment: ${config.context.environment},
Worker: ${config.context.worker},
Worker Pool: ${config.context.worker_pool},
Certificate: ${config.context.certificate},
Feed: ${config.context.feed},
Git Credential: ${config.context.git_credential},
Lifecycle: ${config.context.lifecycle},
Runbook: ${config.context.runbook}`

        // This is an example of an API call
        const spaces = await fetchFromOctopus(config.lastServerUrl, '/api/spaces/all');
        document.getElementById("api").innerText = spaces.map((item) => item["Name"]).join("\n");

        // This is an example of a LLM call
        const result = await dashboardSendPrompt("List the projects in the space " + config.context.space, config.lastServerUrl);
        document.getElementById("prompt").innerText = result.response;
    })
});

async function fetchFromOctopus(serverUrl, endpoint) {
    try {
        const response = await fetch(new URL(endpoint, serverUrl), {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication failed. Please sign in to Octopus Deploy.');
        }

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching from Octopus:', error);
        throw error;
    }
}

