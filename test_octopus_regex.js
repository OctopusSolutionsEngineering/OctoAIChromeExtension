// An adhoc script to test the regex used to match Octopus Server URLs
// Run with:
// node test_octopus_regex.js

function testOctopusServerUrlRegex() {
    // The regex pattern to test
    const OctopusServerUrlRegex = /https:\/\/.+?\.(test)octopus\.app\/app#\/Spaces-.*/;

    // Test cases
    const testUrls = [
        {
            url: "https://instance.testoctopus.app/app#/Spaces-1",
            expectedMatch: true,
            description: "Valid URL - basic format"
        },
        {
            url: "https://instance.testoctopus.app/app#/Spaces-1234/dashboard",
            expectedMatch: true,
            description: "Valid URL - with path after space ID"
        },
        {
            url: "https://other-instance.testoctopus.app/app#/Spaces-9999/projects",
            expectedMatch: true,
            description: "Valid URL - different subdomain"
        },
        {
            url: "https://instance.octopus.app/app#/Spaces-1234",
            expectedMatch: false,
            description: "Invalid URL - missing 'test' subdomain"
        },
        {
            url: "http://instance.testoctopus.app/app#/Spaces-1234",
            expectedMatch: false,
            description: "Invalid URL - HTTP instead of HTTPS"
        },
        {
            url: "https://instance.testoctopus.app/app",
            expectedMatch: false,
            description: "Invalid URL - missing Spaces path"
        },
        {
            url: "https://something-else.com/app#/Spaces-1234",
            expectedMatch: false,
            description: "Invalid URL - different domain"
        }
    ];

    // Run tests
    const results = [];

    for (const testCase of testUrls) {
        const matches = OctopusServerUrlRegex.test(testCase.url);
        const passed = matches === testCase.expectedMatch;

        results.push({
            url: testCase.url,
            description: testCase.description,
            expected: testCase.expectedMatch ? "Match" : "No match",
            actual: matches ? "Match" : "No match",
            passed: passed
        });
    }

    // Display results
    console.log("OctopusServerUrlRegex Test Results:");
    console.table(results.map(r => ({
        Test: r.description,
        URL: r.url,
        Expected: r.expected,
        Actual: r.actual,
        Passed: r.passed ? "✓" : "✗"
    })));

    const failedTests = results.filter(r => !r.passed);
    if (failedTests.length > 0) {
        console.error(`❌ ${failedTests.length} test(s) failed!`);
        failedTests.forEach(test => {
            console.error(`- ${test.description}`);
            console.error(`  URL: ${test.url}`);
            console.error(`  Expected: ${test.expected}`);
            console.error(`  Actual: ${test.actual}`);
        });
    } else {
        console.log(`✅ All ${results.length} tests passed!`);
    }
}

// Run the tests
testOctopusServerUrlRegex();