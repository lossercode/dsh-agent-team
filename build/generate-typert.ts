/**
 * Generate this repository's Typert artifacts without bundling: writes
 * `lib/typert.host.*` and `lib/typert.remote-client.*` under each plugin
 * package, from source, using the published `@deepseek-ai/dsh-typert-generator`.
 * Run from the repository root (or any directory below it) before `tsc -b`.
 * Exit status 0 means every artifact was written, 1 means generation failed.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'
/** Remote-client artifact file names removed when a host face emits none. */
const REMOTE_CLIENT_FILES = ['typert.remote-client.js', 'typert.remote-client.d.ts', 'typert.remote-client.d.ts.map'] as const

const root = fileURLToPath(new URL('..', import.meta.url))

try {
  // checkDiagnostics stays false: `tsc -b` verifies the workspace afterwards, and
  // the client face legitimately resolves the generated `./remote` artifact,
  // which cannot exist before this pass writes it.
  const generator = new WorkspaceTypertGenerator(root, { checkDiagnostics: false })
  const artifacts = generator.generateContributors()
  if (artifacts.length === 0) {
    throw new Error('no Typert contributor packages were discovered')
  }
  for (const artifact of artifacts) {
    const output = join(root, artifact.packageRoot, 'lib')
    mkdirSync(output, { recursive: true })
    writeFileSync(join(output, `typert.${artifact.face}.js`), artifact.js)
    writeFileSync(join(output, `typert.${artifact.face}.d.ts`), artifact.dts)
    if (artifact.remote !== undefined) {
      writeFileSync(join(output, 'typert.remote-client.js'), artifact.remote.js)
      writeFileSync(join(output, 'typert.remote-client.d.ts'), artifact.remote.dts)
      writeFileSync(join(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
    } else if (artifact.face === 'host') {
      for (const file of REMOTE_CLIENT_FILES) rmSync(join(output, file), { force: true })
    }
    console.log(`generate-typert: wrote ${artifact.face} artifacts for ${artifact.package}`)
  }
} catch (error) {
  console.error(`generate-typert: ${String(error)}`)
  process.exitCode = 1
}
