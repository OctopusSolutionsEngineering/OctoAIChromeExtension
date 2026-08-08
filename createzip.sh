#!/bin/bash
rm octopusai.zip
zip -r -q octopusai.zip . -x createzip.sh octopusai.zip README.md .git/\* .idea/\* mock/\* node_modules/\* .claude/\* .playwright-mcp/\*
