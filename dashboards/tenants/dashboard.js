document.addEventListener('DOMContentLoaded', async () => {

    // Initialize the dashboard
    dashboardGetConfig(async config => {
        console.log(config);

        const serverUrl = config.lastServerUrl;
        const select = document.getElementById("spaces-select");

        // Fetch all spaces and populate the dropdown
        const spaces = await fetchFromOctopus(serverUrl, '/api/spaces/all');
        select.innerHTML = "";
        spaces.forEach((space) => {
            const option = document.createElement("option");
            option.value = space["Id"];
            option.textContent = space["Name"];
            select.appendChild(option);
        });

        // Load tenants when the selected space changes
        select.addEventListener("change", () => {
            const spaceId = select.value;
            if (spaceId) {
                loadTenants(serverUrl, spaceId);
            } else {
                clearTenants();
            }
        });

        // Auto-load tenants for the initially selected space
        if (select.value) {
            loadTenants(serverUrl, select.value);
        }
    });
});

async function loadTenants(serverUrl, spaceId) {
    const list = document.getElementById("tenants-list");
    list.innerHTML = "";

    const loading = document.createElement("li");
    loading.textContent = "Loading tenants...";
    list.appendChild(loading);

    try {
        const tenants = await fetchFromOctopus(serverUrl, `/api/${spaceId}/tenants/all`);
        list.innerHTML = "";

        if (tenants.length === 0) {
            const empty = document.createElement("li");
            empty.textContent = "No tenants found in this space.";
            list.appendChild(empty);
            return;
        }

        tenants.forEach((tenant) => {
            const item = document.createElement("li");
            item.textContent = tenant["Name"];
            list.appendChild(item);
        });
    } catch (error) {
        list.innerHTML = "";
        const errorItem = document.createElement("li");
        errorItem.textContent = "Error loading tenants: " + error.message;
        list.appendChild(errorItem);
    }
}

function clearTenants() {
    document.getElementById("tenants-list").innerHTML = "";
}

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

