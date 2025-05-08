#!/bin/bash
rm octopusai.zip
zip -r octopusai.zip . -x createzip.sh octopusai.zip README.md .git/\* .idea/\* mock/\* node_modules/\*
