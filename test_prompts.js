// An adhoc script to test the regex used to match Octopus Server URLs as found in prompts.json
// Run with:
// node test_prompts.js


function testRegex() {
    // Import the patterns from prompts.json
    const patterns = [
        {
            "url": "https://.*?/app#/Spaces-.*?/projects/?(\\?.*|$)",
            "description": "Projects list page pattern"
        },
        {
            "url": "https://.*?/app#/Spaces-.*?/projects/[^/]+/[^?]*\\??.*",
            "description": "Individual project page pattern"
        }
    ];

    // Test cases
    const testUrls = [
        {
            url: "https://instance.example.com/app#/Spaces-1/projects",
            expectedMatches: ["Projects list page pattern"],
            description: "Basic projects list URL"
        },
        {
            url: "https://instance.example.com/app#/Spaces-1/projects?filter=active",
            expectedMatches: ["Projects list page pattern"],
            description: "Projects list URL with query parameters"
        },
        {
            url: "https://instance.octopus.app/app#/Spaces-2328/projects/octopus-copilot/deployments?groupBy=Channel",
            expectedMatches: ["Individual project page pattern"],
            description: "Individual project overview page"
        }
    ];

    // Run tests
    const results = [];

    for (const testCase of testUrls) {
        const matchedPatterns = [];

        for (const pattern of patterns) {
            const regex = new RegExp(pattern.url);
            if (regex.test(testCase.url)) {
                matchedPatterns.push(pattern.description);
            }
        }

        const passed = JSON.stringify(matchedPatterns) === JSON.stringify(testCase.expectedMatches);

        results.push({
            url: testCase.url,
            description: testCase.description,
            expected: testCase.expectedMatches,
            actual: matchedPatterns,
            passed: passed
        });
    }

    // Display results
    console.log("URL Regex Test Results:");
    console.table(results.map(r => ({
        Test: r.description,
        URL: r.url,
        Expected: r.expected.join(", ") || "No matches",
        Actual: r.actual.join(", ") || "No matches",
        Passed: r.passed ? "✓" : "✗"
    })));

    const failedTests = results.filter(r => !r.passed);
    if (failedTests.length > 0) {
        console.error(`❌ ${failedTests.length} test(s) failed!`);
        failedTests.forEach(test => {
            console.error(`- ${test.description}`);
            console.error(`  URL: ${test.url}`);
            console.error(`  Expected: ${test.expected.join(", ") || "No matches"}`);
            console.error(`  Actual: ${test.actual.join(", ") || "No matches"}`);
        });
    } else {
        console.log(`✅ All ${results.length} tests passed!`);
    }
}

// Run the tests
testRegex();