const { execSync } = require('child_process');
try {
  console.log(execSync('tasklist /FI "IMAGENAME eq node.exe"').toString());
} catch(e) { console.error(e); }
