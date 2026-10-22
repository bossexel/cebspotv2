'use strict';
// Compatibility export only. No implicit .env.local loading or production defaults.
module.exports = { ...require('./isolated/client.cjs'), ...require('./isolated/config.cjs') };
