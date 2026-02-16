This project creates a Google Chrome extension called the Octopus AI Assistant that enriches the web interface for Octopus Deploy.

## Custom Dashboards

The `dashboards` directory contains HTML and JavaScript files that provide custom dashboards for Octopus Deploy.

Dashboards that are read only are considered low risk, while dashboards that perform mutating requests are considered risky.

You must highlight any mutating HTTP requests (e.g., POST, PUT, DELETE) in the custom dashboards as part of your review.

You must highlight any API calls to external systems in the custom dashboards, as these can introduce security risks or may not work in restricted environments.

You must highlight any external resources loaded by custom dashboards such as scripts, stylesheets, or iframes, as these can introduce security risks or may not work in restricted environments.

You must highlight any loops over the Octopus Deploy API that could potentially lead to performance issues or infinite loops.

You must check that custom dashboards correctly handle failed authentication with the Octopus Deploy API.

You must ensure that any inputs are validated and sanitized to prevent security vulnerabilities such as cross-site scripting (XSS) or injection attacks.

You must highlight any use of the Chrome extensions API in the custom dashboards, as this can introduce security risks if not used carefully.

You must highlight examples where dashboards attempt to load files from any parent directories (except the `api.js` file in the `dashboards` folder), as this can introduce security risks if not handled carefully.

## Sample Prompts

The files named `promptsv#.json` (where `#` is a number) contain sample prompts displayed by the AI Assistant. These
prompts must be checked for spelling and grammar errors. The files must also be valid JSON.

## General Guidelines

- Check code for security vulnerabilities, especially in the custom dashboards.
- Flag any use of `innerHTML`, as this is a security risk if the content is not properly sanitized.
- Flag any use of `eval()`, as this is a security risk.
- Flag any use of iframes, as they can introduce security risks if not used carefully.
- Flag any changes to the permissions in the `manifest.json` file, as this can introduce security risks.