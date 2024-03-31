import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import { createPositionConverter, resolveNodePositions } from 'twoslash-protocol'
import type * as stylelint from 'stylelint'
import type { NodeErrorWithoutPosition, TwoslashGenericFunction, TwoslashGenericResult } from 'twoslash-protocol'
import { createSyncFn } from 'synckit'

export interface CreateTwoslashStylelintOptions {
  /**
   * Flat configs for Stylelint
   */
  stylelintConfig: stylelint.Config

  /**
   * Custom code transform before sending to Stylelint for verification
   *
   * This does not affect the code rendering
   */
  stylelintCodePreprocess?: (code: string) => string

  /**
   * The current working directory for Stylelint
   */
  cwd?: string

  /**
   * Include the parsed docs in the result
   *
   * @default true
   */
  includeDocs?: boolean

  /**
   * Merge error messages that has same range
   * @default true
   */
  mergeMessages?: boolean
}

export function createTwoslasher(options: CreateTwoslashStylelintOptions): TwoslashGenericFunction {
  const {
    includeDocs = true,
    mergeMessages = true,
  } = options

  const workerPath = path.join(fileURLToPath(import.meta.url), '../stylelint-worker.mjs')

  const lint = createSyncFn(workerPath)

  return (code, file) => {
    const filename = file?.includes('.') ? file : `index.${file ?? 'css'}`
    const linterResult: stylelint.LinterResult = lint({
      config: options.stylelintConfig,
      codeFilename: filename,
      code: options.stylelintCodePreprocess?.(code) || code,
    }) as stylelint.LinterResult

    const result = linterResult.results[0]

    const pc = createPositionConverter(code)
    const raws: NodeErrorWithoutPosition[] = result.warnings.map((message): NodeErrorWithoutPosition => {
      const start = pc.posToIndex(message.line - 1, message.column - 1)
      const end = message.endLine != null && message.endColumn != null
        ? pc.posToIndex(message.endLine - 1, message.endColumn - 1)
        : start + 1

      let text = message.text
      if (message.rule) {
        const link = includeDocs && linterResult.ruleMetadata?.[message.rule]?.url
        text += link
          ? ` ([${message.rule}](${link}))`
          : ` (${message.rule})`
      }

      return {
        type: 'error',
        id: message.rule || '',
        code: 0,
        text,
        start,
        length: end - start,
        level: message.severity,
        filename,
      }
    })

    let merged: NodeErrorWithoutPosition[] = []
    if (mergeMessages) {
      for (const current of raws) {
        const existing = merged.find(r => r.start === current.start && r.length === current.length)
        if (existing) {
          existing.text += `\n\n${current.text}`
          continue
        }
        merged.push(current)
      }
    }
    else {
      merged = raws
    }

    const nodes = resolveNodePositions(merged, code)
      .filter(i => i.line < pc.lines.length) // filter out messages outside of the code

    const results: TwoslashGenericResult = {
      code,
      nodes,
    }

    return results
  }
}
