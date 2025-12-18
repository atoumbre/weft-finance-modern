#!/bin/bash
npm install
npm run build
zip -r dispatcher.zip dist/ node_modules/
