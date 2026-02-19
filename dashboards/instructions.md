Custom dashboards are HTML pages embedded in the extension that interact with the Octopus API to display information about your projects, environments, and deployments.

To create a custom dashboard, follow these steps:

1. Create a new directory in the `dashboards` folder. The directory can only include lowercase letters and numbers.
2. Create a file called `index.html` in the new directory. This file will contain the HTML, CSS, and JavaScript for your dashboard.
3. Create a `metadata.json` file in the new directory with the following content, replacing the email address with your own:
   ```json
   {
     "author_email": "your email"
   }
   ```
4. Reference the dashboard in the `promptsv#.json` file by adding an entry to the prompt called `Community dashboards...`. Note the `#` is a number and should be the latest version of the prompts file.
5. The HTML page must include the `api.js` script and call the `dashboardGetConfig()` function to get the dashboard configuration.
6. The configuration returned by the `dashboardGetConfig()` function includes:
   * `serverUrls`, which is an array of the Octopus instances that the user has opened dashboards for.
   * `lastServerUrl`, which is the URL of the instance that the user last opened a dashboard for.
   * `context`, a map containing details about the page from which the dashboard was opened. See the `getUIContext()` function in [scripts/dashboard.js](../scripts/dashboard.js) for more details about the context object.
7. Requests to the Octopus API must include credentials, which will pass the cookies associated with the current session.
8. See the [Copilot Instructions](../.github/copilot-instructions.md) for the best practices for writing the code for your dashboard.

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

You can open the page for testing without needing to modify the `promptsv#.json` file by running the `showDashboard()` function from the service worker in the Chrome extension developer tools.

Open the Chrome extension service worker from the Extensions page in Chrome. Click the "Inspect views service worker" link to open the developer tools for the extension. In the console, paste the following code to open the dashboard:

```javascript
showDashboard({
   dashboardFile: "dashboarddir/index.html", 
   serverUrl: "https://yourinstance.octopus.app/", 
   context: {project: "My Project", space: "My Space", etc...}
})
```

## Dashboard Guidelines

* The dashboard must function in isolation. Any individual dashboard must be able to be updated or removed without impacting the functionality of other dashboards. This means no sharing of assets like images, css, or JavaScript files across dashboards.
* Prefer using raw HTML and JavaScript rather than using external libraries like React or Angular. Because each dashboard must function in isolation, using external libraries would require bundling the library with each dashboard, which would lead to larger file sizes and slower load times.
* There are no style style requirements for dashboards, but you should aim to create a user experience that is consistent with the Octopus Deploy web portal.
* You must include a `metadata.json` file in the dashboard directory with the following content:

```json
{
  "author_email": "your email"
}
```

## Use of Gen AI in Dashboards

It is expected that dashboards will be built using Gen AI. The [Copilot Instructions](../.github/copilot-instructions.md) can be passed to your LLM to produce code that meets the requirements for dashboards.