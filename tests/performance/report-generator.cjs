'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { generate } = require('./isolated/report.cjs');
if (require.main === module) {
  try {
    if (!process.argv[2]) throw Error('Provide an isolated summary.json and optional matching race.json');
    const file = path.resolve(process.argv[2]);
    const result = JSON.parse(fs.readFileSync(file, 'utf8'));
    const race = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : null;
    if (race && race.runId !== result.runId) throw Error('Evidence run IDs differ');
    fs.writeFileSync(path.join(path.dirname(file), 'report.md'), generate(result, race));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { generateAssessment: generate };
