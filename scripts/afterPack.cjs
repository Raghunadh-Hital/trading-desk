const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
    const dest = path.join(context.appOutDir, 'resources', 'server', 'node_modules');
    const src = path.join(context.packager.projectDir, 'server', 'node_modules');
    console.log(`[afterPack] Copying server/node_modules from ${src} to ${dest}...`);
    if (fs.existsSync(src)) {
        fs.cpSync(src, dest, { recursive: true, dereference: true });
        console.log(`[afterPack] Successfully copied server/node_modules!`);
    } else {
        console.warn(`[afterPack] Source server/node_modules does not exist!`);
    }
};
