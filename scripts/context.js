
function getPageName() {
    return Object.keys(getPageRegex())
        .filter(key => window.location.href.match(getPageRegex()[key]))
        .sort((a, b) => a.length - b.length)
        .pop();
}

async function getFirstEnvironmentName() {
    const match = window.location.href.match(/(Spaces-\d+)/);
    if (match) {
        const names = await fetch("/api/Spaces/" + match[1] + "/Environments", {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Items.map(item => item.Name))

        if (names.length > 0) {
            return names[0]
        }

        return "MyEnvironment"
    }
    return null;
}

async function getSpaceId() {
    const match = window.location.href.match(/(Spaces-\d+)/);
    if (match) {
        return match[1]
    }
    return null;
}

async function getSpaceName() {
    const match = window.location.href.match(/(Spaces-\d+)/);
    if (match) {
        return await fetch("/api/Spaces/" + match[1], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getProjectName() {
    const match = window.location.href.match(/https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/[^?]*\\??.*/);
    if (match) {
        return await fetch("/api/" + match[1] + "/projects/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getDeploymentName() {
    const match = window.location.href.match(/https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/deployments\/releases\/([^\/]+)\/deployments\/([^?]*)\\??.*/);
    if (match) {
        return match[4]
    }
    return null;
}

async function getRunbookRun() {
    const match = window.location.href.match(/https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/operations\/runbooks\/([^\/]+)\/snapshots\/([^\/]*)\/runs\/([^?]*)\\??.*/);
    if (match) {
        return match[5]
    }
    return null;
}

async function getReleaseVersion() {
    const match = window.location.href.match(/https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/deployments\/releases\/([^\/]+)(\/.*)/);
    if (match) {
        return decodeURIComponent(match[3])
    }
    return null;
}

async function getRunbookName() {
    const match = window.location.href.match(/https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/operations\/runbooks\/([^\/]+)\/[^?]*\\?([?].*)/);
    if (match) {

        // We need to deal with CaC and database runbooks differently
        const urlObj = new URL(window.location.href);
        const params = new URLSearchParams(urlObj.search);
        const gitRef = params.get("gitRef");

        // The presence of a gitRef param indicates that this is a CaC runbook
        if (gitRef) {
            return await fetch("/api/" + match[1] + "/projects/" + match[2] + "/" + gitRef + "/runbooks/" + match[3], {credentials: 'include'})
                .then(response => response.json())
                .then(json => json.Name)

        }

        return await fetch("/api/" + match[1] + "/Runbooks/" + match[3], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }

    // We also need the runbook name from a runbook run
    const runbookRun = await getRunbookRun();
    const spaceId = await getSpaceId()
    if (runbookRun && spaceId) {
        return await fetch("/api/" + spaceId + "/RunbookRuns/" + runbookRun, {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.RunbookName)
    }
    return null;
}

async function getTenantName() {
    const match = window.location.href.match(/https?:\/\/.*?\/app#\/(Spaces-\d+?)\/tenants\/([^\/]+)\/[^?]*\\??.*/);
    if (match) {
        return await fetch("/api/" + match[1] + "/Tenants/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getLibraryVariableSet() {
    const match = window.location.href.match(/https?:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/variables\/([^\/]+)(\\??.*)?/);
    if (match) {
        return await fetch("/api/" + match[1] + "/LibraryVariableSet/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getMachine() {
    const match = window.location.href.match(/https?:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/machines\/([^\/]+)\/[^?]*(\\??.*)?/);
    if (match) {
        return await fetch("/api/" + match[1] + "/Machines/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getAccount() {
    const match = window.location.href.match(/https?:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/accounts\/([^\/]+)(\\??.*)?/);
    if (match) {
        return await fetch("/api/" + match[1] + "/Accounts/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getEnvironment() {
    const match = window.location.href.match(/https?:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/environments\/([^\/]+)(\\??.*)?/);
    if (match) {
        return await fetch("/api/" + match[1] + "/Environments/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }

    // We can also extract an environment from a deployment
    const deploymentId = await getDeploymentName()
    const spaceId = await getSpaceId()

    if (deploymentId) {
        const environmentId = await fetch("/api/" + spaceId + "/Deployments/" + deploymentId, {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.EnvironmentId)

        if (environmentId) {
            return await fetch("/api/" + spaceId + "/Environments/" + environmentId, {credentials: 'include'})
                .then(response => response.json())
                .then(json => json.Name)
        }
    }

    const runbookRun = await getRunbookRun()

    if (runbookRun) {
        const environmentId = await fetch("/api/" + spaceId + "/RunbookRuns/" + runbookRun, {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.EnvironmentId)

        if (environmentId) {
            return await fetch("/api/" + spaceId + "/Environments/" + environmentId, {credentials: 'include'})
                .then(response => response.json())
                .then(json => json.Name)
        }
    }

    return null;
}

async function getCertificate() {
    const match = window.location.href.match(/https?:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/certificates\/([^\/]+)(\\??.*)?/);
    if (match) {
        return await fetch("/api/" + match[1] + "/Certificates/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getFeed() {
    const match = window.location.href.match(/https?:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/feeds\/([^\/]+)(\\??.*)?/);
    if (match) {
        return await fetch("/api/" + match[1] + "/Feeds/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getGitCredential() {
    const match = window.location.href.match(/https?:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/gitcredentials\/([^\/]+)(\\??.*)?/);
    if (match) {
        return await fetch("/api/" + match[1] + "/Git-Credentials/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getLifecycle() {
    const match = window.location.href.match(/https?:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/lifecycles\/([^\/]+)(\\??.*)?/);
    if (match) {
        return await fetch("/api/" + match[1] + "/Lifecycles/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getWorker() {
    const match = window.location.href.match(/https?:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/workers\/([^\/]+)\/[^?]*(\\??.*)?/);
    if (match) {
        return await fetch("/api/" + match[1] + "/Workers/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getWorkerPool() {
    const match = window.location.href.match(/https?:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/workerpools\/([^\/]+)\/[^?]*(\\??.*)?/);
    if (match) {
        return await fetch("/api/" + match[1] + "/WorkerPools/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.Name)
    }
    return null;
}

async function getStepName() {
    const match = window.location.href.match(/https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/deployments\/process\/steps\\?.*/);
    if (match) {
        const parentStepId = new URLSearchParams(window.location.href.split("?")[1]).get("parentStepId");

        const steps = await fetch("/api/" + match[1] + "/projects/" + match[2], {credentials: 'include'})
            .then(response => response.json())
            .then(json => json.DeploymentProcessId)
            .then(deploymentProcessId => fetch("/api/" + match[1] + "/DeploymentProcesses/" + deploymentProcessId, {credentials: 'include'}))
            .then(response => response.json())
            .then(json => json.Steps)

        const step = steps
            .filter(step => step.Id === parentStepId)
            .map(step => step.Name);

        if (step.length > 0) {
            return step[0]
        }
    }
    return null;
}

/*
    Returns an object that maps page URLs to plain english path breadcrumbs.
 */
function getPageRegex() {
    return {
        "Dashboard": /https?:\/\/.*?\/app#\/Spaces-.*?\/projects\/?(\?.*)$/,
        "Tasks": /https?:\/\/.*?\/app#\/Spaces-.*?\/tasks\/?(\?.*)$/,
        "Project": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/deployments\/?(\?.*)$/,
        "Project.Settings": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/settings$/,
        "Project.VersionControl": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/settings\/versioncontrol$/,
        "Project.ITSMProviders": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/settings\/itsmproviders$/,
        "Project.Channels": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/deployments\/channels$/,
        "Project.Triggers": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/deployments\/triggers$/,
        "Project.Process": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/(([^\/]+)\/)*deployments\/process$/,
        "Project.Step": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/(branches\/([^\/]+)\/)?deployments\/process\/steps(\?.*)?/,
        "Project.Variables": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/(([^\/]+)\/)+variables/,
        "Project.AllVariables": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/(([^\/]+)\/)+variables\/all/,
        "Project.PreviewVariables": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/(([^\/]+)\/)+variables\/preview/,
        "Project.VariableSets": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/variables\/library/,
        "Project.TenantVariables": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/tenant\/project-templates$/,
        "LibraryVariableSets": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/variables\/?(\?.*)?/,
        "LibraryVariableSets.LibraryVariableSet": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/variables\/([^\/]+)(\?.*)?/,
        "Project.Operations": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/operations$/,
        "Project.Operations.Triggers": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/operations\/triggers$/,
        "Project.Runbooks": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/operations\/runbooks$/,
        "Project.Runbooks.Runbook": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/operations\/runbooks\/([^\/]+)\/[^?]*(\?.*)?/,
        "Project.Runbooks.Runbook.Run": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/operations\/runbooks\/([^\/]+)\/snapshots\/([^\/]*)\/runs\/([^?]*)\/?(\?.*)?/,
        "Project.Deployment": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/deployments\/releases\/([^\/]+)\/deployments\/([^?]*)\/?(\?.*)?/,
        "Project.Release": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/projects\/([^\/]+)\/deployments\/releases$/,
        "Machines": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/machines/,
        "Machines.Machine": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/machines\/([^\/]+)\/[^?]*(\?.*)?/,
        "Accounts": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/accounts/,
        "Accounts.Account": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/accounts\/([^\/]+)(\?.*)?/,
        "Workers": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/workers/,
        "WorkerPools": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/workerpools/,
        "MachinePolicies": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/machinepolicies/,
        "MachineProxies": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/proxies/,
        "Feeds": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/feeds/,
        "GitCredentials": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/gitcredentials/,
        "GitConnections": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/gitconnections/,
        "Lifecycles": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/lifecycles/,
        "Packages": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/builtinrepository/,
        "ScriptModules": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/scripts/,
        "StepTemplates": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/steptemplates/,
        "TagSets": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/tagsets/,
        "TagSets.TagSet": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/tagsets\/(TagSets-\d+)/,
        "Tenants": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/tenants/,
        "Tenants.Tenant": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/tenants\/([^\/]+)\/[^?]*(\?.*)?/,
        "Certificates": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/certificates/,
        "Environments": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/environments/,
        "Environments.Environment": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/environments\/([^\/]+)(\?.*)?/,
        "Infrastructure": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/infrastructure\/overview/,
        "BuildInformation": /https?:\/\/.*?\/app#\/(Spaces-\d+?)\/library\/buildinformation/
    }
}
    