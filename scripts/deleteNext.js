const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'frontend', '.next');

function rmdirRecursive(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.lstatSync(full);
    if (stat.isDirectory()) {
      rmdirRecursive(full);
    } else {
      try {
        fs.chmodSync(full, 0o666);
        fs.unlinkSync(full);
      } catch (e) {
        console.error('unlink failed', full, e.message);
      }
    }
  }
  try {
    fs.rmdirSync(dir);
  } catch (e) {
    console.error('rmdir failed', dir, e.message);
  }
}

rmdirRecursive(target);
console.log('.next removal attempted');
