const github = require('@actions/github');
const core = require('@actions/core');
const yaml = require('yaml');
const font = require('font-color-contrast');

run();

async function run() {
    try {
        const token = core.getInput('token');
        const nwo = core.getInput('nwo');
        const octokit = github.getOctokit(token);

        if (!isValidAction(nwo)) {
            throw new Error('Action is not of format "owner/name".');
        }

        const { contents, aInYaml } = await getAction(nwo, octokit);

        if (!contents) {
            throw new Error(`${nwo} doesn't appear to have an action.yml or action.yaml.`);
        }

        const mermaid = convertActionToMermaid(contents, { nwo, aInYaml });

        // '```mermaid\n```' length is 14
        if (mermaid.length === 14) {
            throw new Error('Action definition is empty');
        }

        core.setOutput('mermaid', mermaid);
    } catch (error) {
        core.setFailed(error.message);
    }
}

// get action.yml (preferred) or action.yaml at path
async function getAction(nwo, octokit) {
    const owner = nwo.split('/')[0];
    const repo = nwo.split('/')[1];
    core.debug(`Getting metadata for action: ${nwo}`);
    
    try {
        let { data: contents } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: 'action.yml',
            mediaType: {
                format: 'raw'
            }
        });
        if (contents) {
            return { 
                contents,
                aInYaml: false
            };
        }
    } catch (error) {
        let { data: contents } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: 'action.yaml',
            mediaType: {
                format: 'raw'
            }
        });
        if (contents) {
            return {
                contents,
                aInYaml: true
            };
        }
        else {
            return {
                contents: null
            };
        }
    }
}

// Check if action is of format "owner/name"
function isValidAction(nwo) {
    const regex = /^[a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+$/;
    return regex.test(nwo);
}

function convertActionToMermaid(contents, options) {
    core.debug(`Converting content to mermaid: ${contents}`);
    const json = yaml.parse(contents);
    core.debug(`Converted yaml as json: ${JSON.stringify(json)}`);
    if (Object.keys(json).length === 0) {
        throw new Error('Action is empty');
    }
    let mermaid = '```mermaid\n';
    mermaid += `flowchart LR\n`;
    const name = getName(json);
    mermaid += handleInputs(json, name);
    mermaid += handleOutputs(json, name);
    mermaid += handleClassDefs(json);
    mermaid += handleClicks(json, { contents, nwo: options.nwo, aInYaml: options.aInYaml });
    mermaid += '```';
    core.debug(`Converted mermaid: ${mermaid}`);
    return mermaid;
}

function getName(json) {
    const name = json.name;
    if (!name) {
        throw new Error('Action does not have a name');
    }
    return name;
}

function handleInputs(json, name) {
    const inputs = Object.keys(json.inputs);
    let str = ``;
    for (const input of inputs) {
        const required = json.inputs[input].required ? 'required' : 'optional';
        str += `${input}:::${required}-->action(${name}):::action\n`;
        counter++;
    }
    return str;
}

function handleOutputs(json, name) {
    const outputs = Object.keys(json.outputs);
    let str = ``;
    for (const output of outputs) {
        str += `action(${name})-->${output}:::output\n`;
        counter++;
    }
    return str;
}

function handleClassDefs(json) {
    let classDef = ``;
    classDef += `classDef required fill:#6ba06a,stroke:#333,stroke-width:3px\n`;
    classDef += `classDef optional fill:#d9b430,stroke:#333,stroke-width:3px\n`;
    
    // decide whether white or black text based on fill color
    const background = json['branding'] ? json['branding']['color'] : '#a2a5a9';
    const fontColor = font.default(background);

    classDef += `classDef action fill:${background},stroke:#333,stroke-width:3px,color:${fontColor}\n`;
    classDef += `classDef output fill:#fff,stroke:#333,stroke-width:3px,color:#333\n`;
    return classDef;
}

function handleClicks(json, options) {
    let str = ``;

    // get a list of all the inputs and their matching line numbers
    const inputs = Object.keys(json.inputs);
    const inputLines = {};
    for (const input of inputs) {
        const line = getLineNumber(options.contents, input);
        inputLines[input] = line;
        str += `click ${input} "${makeClickLink(options.nwo, options.aInYaml, line)}"\n`;
    }
    // get a list of all the outputs and their matching line numbers
    const outputs = Object.keys(json.outputs);
    const outputLines = {};
    for (const output of outputs) {
        const line = getLineNumber(options.contents, output);
        outputLines[output] = line;
        str += `click ${output} "${makeClickLink(options.nwo, options.aInYaml, line)}"\n`;
    }
    core.debug(`inputLines: ${JSON.stringify(inputLines)}`);
    core.debug(`outputLines: ${JSON.stringify(outputLines)}`);

    return str;
}

function makeClickLink(nwo, aInYaml, line) {
    return `${process.env.GITHUB_SERVER_URL}/${nwo}/blob/main/action.y${aInYaml ? 'a' : ''}ml#L${line}`;
}

function getLineNumber(contents, input) {
    const regex = new RegExp(`${input}`, 'g');
    const lines = contents.split('\n');
    let line = 1;
    for (const l of lines) {
        if (regex.test(l)) {
            return line;
        }
        line++;
    }
    return null;
}
