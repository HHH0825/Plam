// Compatibility entry: always builds the approved 2026-10-14 login art.
require('./prepare-theme-refresh.cjs').prepareWelcome().then(bytes=>console.log(JSON.stringify({bytes}))).catch(e=>{console.error(e);process.exitCode=1})
