// Run the same behavioral tests against the built modules, not a second implementation.
const Module=require('node:module'),fs=require('node:fs'),path=require('node:path')
const original=Module._resolveFilename,source=path.resolve(__dirname,'../miniprogram')+path.sep,built=path.resolve(__dirname,'../../test-results/cover-expansion-project')+path.sep
Module._resolveFilename=function(...args){const resolved=original.apply(this,args);if(resolved.startsWith(source)){const target=built+resolved.slice(source.length);if(!fs.existsSync(target))throw Error('Missing build output '+target);return target}return resolved}
