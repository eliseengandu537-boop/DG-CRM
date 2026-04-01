const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const fileExtensions = new Set(['.js', '.d.ts']);

function walk(currentPath, files = []) {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      walk(entryPath, files);
      continue;
    }

    if (fileExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

function toRelativeImport(filePath, targetPath) {
  const absoluteTarget = path.join(distDir, targetPath);
  let relativePath = path.relative(path.dirname(filePath), absoluteTarget).replace(/\\/g, '/');
  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`;
  }

  return relativePath;
}

function replaceAliases(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const rewritten = source.replace(/(['"])@\/([^'"]+)\1/g, (_match, quote, targetPath) => {
    return `${quote}${toRelativeImport(filePath, targetPath)}${quote}`;
  });

  if (rewritten !== source) {
    fs.writeFileSync(filePath, rewritten, 'utf8');
  }
}

if (!fs.existsSync(distDir)) {
  process.exit(0);
}

for (const filePath of walk(distDir)) {
  replaceAliases(filePath);
}
