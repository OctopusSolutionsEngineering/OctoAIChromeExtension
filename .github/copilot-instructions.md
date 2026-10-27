This project creates a Google Chrome extension called the Octopus AI Assistant that enriches the web interface for Octopus Deploy.

## Network access

Network requests must respond to a 429 status code (Too Many Requests) by retrying the request after a delay.

API access must be rate limited to 200 requests per minute. This must be achieved with the p-throttle library. This is an example:

```javascript
const throttle = pThrottle({
	limit: 200,
	interval: 60000
});

const result = await throttle(() => fetch(
    "https://yourinstance.octopus.app/api/yourendpoint",
    {
        method: "GET",
        headers: {
            "Accept": "application/json"
        },
        credentials: "include"
    }
))();
```

## General Guidelines

- Check code for security vulnerabilities.
- Flag any use of `innerHTML` without first purifying the result with `DOMPurify.sanitize()` or some other HTML escaping function, as this is a security risk if the content is not properly sanitized.
- Flag any use of `eval()`, as this is a security risk.
- Flag any use of iframes, as they can introduce security risks if not used carefully.
- Flag any changes to the permissions in the `manifest.json` file, as this can introduce security risks.