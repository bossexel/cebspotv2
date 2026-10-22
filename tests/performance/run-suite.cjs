'use strict';
require('./isolated/load.cjs').main().catch(error => { console.error(error.message); process.exitCode = 1; });
