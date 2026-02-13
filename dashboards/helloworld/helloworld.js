getDashboardConfig(config => {
    document.getElementById("server").innerText = `Server: ${config.serverUrl}`;
})

getSpaces().then(data => {
    const spaces = data.Items.map(item => item.Name)
    document.getElementById("server").innerText = spaces
})

function getSpaces() {
    return new Promise((resolve, reject) => {
        getDashboardConfig(config => {
            resolve(fetch(config.serverUrl + "/api/Spaces", {headers: {'Authorization': "Bearer " + config.accessToken}})
                .then(response => response.json()));
        })
    });
}