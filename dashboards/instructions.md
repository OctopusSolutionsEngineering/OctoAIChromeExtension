Custom dashboards are HTML pages embedded in the extension that interact with the Octopus API to display information about your projects, environments, and deployments.

To create a custom dashboard, follow these steps:

1. Create a new directory in the `dashboards` folder. The directory can only include lowercase letters and numbers.
2. Create a file called `index.html` in the new directory. This file will contain the HTML, CSS, and JavaScript for your dashboard.
3. Reference the dashboard in the `promptsv#.json` file by adding an entry to the prompt called `Community dashboards...`. Note the `#` is a number and should be the latest version of the prompts file.
4. The HTML page must include the `api.js` script and call the `dashboardGetConfig()` function to get the dashboard configuration.
5. The configuration returned by the `dashboardGetConfig()` function includes:
   * `serverUrls`, which is an array of the Octopus instances that the user has opened dashboards for.
   * `lastServerUrl`, which is the URL of the instance that the user last opened a dashboard for.
6. Requests to the Octopus API must include credentials, which will pass the cookies associated with the current session.
7. See the [Copilot Instructions](../.github/copilot-instructions.md) for the best practices for writing the code for your dashboard.

This is an example of the JSON entry to include in the `promptsv#.json` file to reference a custom dashboard:

```json
{
    "name":"Dashboard",
    "prompts" : [
      {
        "name": "Community dashboards...",
        "prompts": [
          {
            "dashboardName": "Value Metrics",
            "dashboardFile": "valuemetrics/index.html"
          }
        ]
      }
   ]
}
```

## Testing

Open the Chrome extension service worker from the Extensions page in Chrome. Click the "Inspect views service worker" link to open the developer tools for the extension. In the console, paste the following code to open the dashboard:

```javascript
showDashboard({dashboardFile: "dashboarddir/index.html", serverUrl: "https://yourinstance.octopus.app/"})
```