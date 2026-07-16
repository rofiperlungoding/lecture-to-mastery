// Fix __dirname in ESM context for E2E test files
// Adds fileURLToPath import and derives __dirname from import.meta.url

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const files = [
  'e2e/performance.spec.ts',
  'e2e/edge-functions.spec.ts',
  'e2e/security-rls.spec.ts',
]

for (const file of files) {
  const filePath = path.resolve(__dirname, '..', file)
  let content = fs.readFileSync(filePath, 'utf-8')
  
  // Add import for fileURLToPath
  if (content.includes("import * as path from 'path'")) {
    content = content.replace(
      "import * as path from 'path'",
      "import * as path from 'path'\nimport { fileURLToPath } from 'url'"
    )
  }
  
  // Find first __dirname usage and add definitions before it
  const firstDirnameIdx = content.indexOf('__dirname')
  if (firstDirnameIdx > 0) {
    const lineStart = content.lastIndexOf('\n', firstDirnameIdx - 1) + 1
    const indent = content.slice(lineStart, firstDirnameIdx).match(/^\s*/)[0]
    const insert = indent + "const __filename = fileURLToPath(import.meta.url);\n" + indent + "const __dirname = path.dirname(__filename);\n"
    content = content.slice(0, lineStart) + insert + content.slice(lineStart)
  }
  
  fs.writeFileSync(filePath, content, 'utf-8')
  console.log('✅ Fixed: ' + file)
}
