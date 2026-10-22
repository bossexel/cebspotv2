'use strict';
require('./isolated/concurrency.cjs').main().catch(error => { console.error(error.message); process.exitCode = 1; });
