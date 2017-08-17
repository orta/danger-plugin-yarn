// Provides dev-time typing structure for  `danger` - doesn't affect runtime.
import { DangerDSLType } from "../node_modules/danger/distribution/dsl/DangerDSL"
import { JSONDiff } from "../node_modules/danger/distribution/dsl/GitDSL"
declare var danger: DangerDSLType
declare var peril: any | null
export declare function message(message: string): void
export declare function warn(message: string): void
export declare function fail(message: string): void
export declare function markdown(message: string): void

import * as child_process from "child_process"
import { distanceInWords } from "date-fns"
import * as fetch from "node-fetch"
import * as semver from "semver"

import * as includesOriginal from "lodash.includes"
const includes = includesOriginal as any

// Celebrate when a new release is being shipped
export const checkForRelease = packageDiff => {
  if (packageDiff.version && packageDiff.version.before && packageDiff.version.after) {
    if (semver.lt(packageDiff.version.before, packageDiff.version.after)) {
      message(":tada: - congrats on your new release")
    }
  }
}

export interface DepDuplicationCache {
  [depName: string]: {
    packageJSONPaths: string[]
    npmData: PartiallyRenderedNPMMetadata
    yarnBody?: string
  }
}
const cacheEntryForDep = (
  cache: DepDuplicationCache,
  depName: string
): [/*freshlyCreated:*/ boolean, /*cacheEntry:*/ DepDuplicationCache[keyof DepDuplicationCache]] => {
  if (cache[depName]) {
    return [false, cache[depName]]
  } else {
    cache[depName] = {
      packageJSONPaths: [],
      npmData: {
        details: [],
        readme: "`[no-data-present]`",
      },
    }
    return [true, cache[depName]]
  }
}

// Initial stab at showing information about a new dependency
export const checkForNewDependencies = async (
  packagePath: string,
  packageDiff: JSONDiff,
  duplicationCache: DepDuplicationCache,
  npmAuthToken?: string
) => {
  const newDependencies = findNewDependencies(packageDiff)
  for (const dep of newDependencies) {
    const [freshlyCreated, cacheEntry] = cacheEntryForDep(duplicationCache, dep)

    cacheEntry.packageJSONPaths.push(packagePath)
    if (!freshlyCreated) {
      continue
    }

    // Pump out a bunch of metadata information
    const npm = await getNPMMetadataForDep(dep, npmAuthToken)
    if (npm) {
      cacheEntry.npmData.details = npm.details
      cacheEntry.npmData.readme = npm.readme
    } else if (dep) {
      warn(`Could not get info from npm on ${safeLink(dep)}</a>`)
    }

    if ("undefined" === typeof peril) {
      const yarn = await getYarnMetadataForDep(dep)
      if (yarn && yarn.length) {
        cacheEntry.yarnBody = yarn
      } else if (dep) {
        warn(`Could not get info from yarn on ${safeLink(dep)}`)
      }
    }
  }
}

export const findNewDependencies = (packageDiff: JSONDiff) => {
  const added = [] as string[]
  for (const element of [packageDiff.dependencies, packageDiff.devDependencies]) {
    if (element && element.added && element.added.length) {
      added.push.apply(added, element.added)
    }
  }
  return added
}

export const getYarnMetadataForDep = async dep => {
  return new Promise<string>(resolve => {
    child_process.exec(`yarn why '${dep}' --json`, (err, output) => {
      if (output) {
        // Comes as a series of little JSON messages
        const usefulJSONContents = output.toString().split(`{"type":"activityEnd","data":{"id":0}}`).pop() as string
        const asJSON = usefulJSONContents.split("}\n{").join("},{")

        const whyJSON = JSON.parse(`[${asJSON}]`)
        const messages = whyJSON.filter(msg => typeof msg.data === "string").map(m => m.data)
        resolve(`
  <details>
    <summary><code>yarn why ${printDep(dep)}</code> output</summary>
    <ul><li><code>${messages.join("</code></li><li><code>")}
    </code></li></ul>
  </details>
  `)
      } else {
        resolve("")
      }
    })
  })
}

const safeLink = (name: string) => `<a href='${linkToNPM(name)}'><code>${printDep(name)}</code></a>`
const printDep = (name: string) => name.replace(/@/, "&#64;")
const linkToNPM = (name: string) => `https://www.npmjs.com/package/${name}`

const forwardSlashRegex = /(\/+)/g
/**
 * Long enough URLs as contiguous text forces browsers to avoid wrapping them
 *  this expands a table beyond the bounds of the viewport too easily.
 * Inserting <wbr/> tags allows the browser to wrap the url at each path segment.
 */
const wrappableURLForTextDisplay = (url: string) => (url || "").replace(forwardSlashRegex, `$1<wbr/>`)

/** Represents a label / value, aka 2 cells */
export interface TableDeetNew {
  /** Label */
  name: string
  /** Value */
  message: string
  /** Applies to the message cell, not the label-cell */
  colspan?: number
}
/** Represents arbitrary cell contents */
export interface TableDeetFormatted {
  content: string
  colspan?: number
}
/** Represents arbitrary cell that will be dynamically replaced on final render */
export interface TableDeetPlaceholder {
  placeholderKey: "used-in-packages"
  colspan?: number
}
export interface TableRowBreak { break: "row-break" }

export type TableDeet = TableRowBreak | TableDeetNew | TableDeetFormatted | TableDeetPlaceholder
const isTableDeetPlaceholder = (deet: TableDeet): deet is TableDeetPlaceholder => {
  return "placeholderKey" in deet
}
const isTableDeetFormatted = (deet: TableDeet): deet is TableDeetFormatted => {
  return "content" in deet
}
const isTableRowBreak = (deet: TableDeet): deet is TableRowBreak => {
  return "break" in deet
}

export interface PartiallyRenderedNPMMetadata {
  details: TableDeet[]
  readme: string
}

export const getNPMMetadataForDep = async (
  dep: string,
  npmAuthToken?: string
): Promise<PartiallyRenderedNPMMetadata | undefined> => {
  const sentence = danger.utils.sentence

  // Note: NPM can't handle encoded '@'
  const urlDep = encodeURIComponent(dep).replace("%40", "@")

  const headers = npmAuthToken ? { Authorization: `Bearer ${npmAuthToken}` } : undefined
  const npmResponse = await fetch(`https://registry.npmjs.org/${urlDep}`, { headers })

  if (npmResponse.ok) {
    /**
     * TableDeets is carefully constructed to be a 2-wide table, with some entries spanning columns
     * Testing on mobile / web, 4-wide tables were too easy to break the viewport bounds.
     */
    const tableDeets: TableDeet[] = []
    const npm = await npmResponse.json()

    const homepage = npm.homepage ? npm.homepage : `http://npmjs.com/package/${dep}`
    // Left
    tableDeets.push({ content: `<h2><a href="${homepage}">${printDep(dep)}</a></h2>` })
    // Right
    tableDeets.push({ placeholderKey: "used-in-packages" })

    tableDeets.push({ break: "row-break" })

    // Left
    tableDeets.push({ name: "Author", message: npm.author && npm.author.name ? npm.author.name : "Unknown" })
    // Right
    tableDeets.push({ name: "Description", message: npm.description })

    tableDeets.push({ break: "row-break" })

    // Left
    const license = npm.license
    if (license) {
      tableDeets.push({ name: "License", message: license })
    } else {
      // License is important, so always show info
      const { versions = {} } = npm
      const licenses = Object.keys(versions)
        .sort((a, b) => (semver.gte(b, a) ? 1 : 0)) // sort latest versions first
        .map(version => versions[version].license) // get the license
        .filter(Boolean) // remove falsy values
      tableDeets.push({
        name: "License",
        message: `<b>${licenses[0] || "NO LICENSE FOUND"}</b>`,
      })
    }
    // Right
    tableDeets.push({ name: "Homepage", message: `<a href="${homepage}">${wrappableURLForTextDisplay(homepage)}</a>` })

    tableDeets.push({ break: "row-break" })

    const hasKeywords = npm.keywords && npm.keywords.length
    if (hasKeywords) {
      // Whole row
      tableDeets.push({
        name: "Keywords",
        message: sentence(npm.keywords),
        colspan: 2,
      })
      tableDeets.push({ break: "row-break" })
    }

    const createdTimeStr = npm.time && npm.time.created
      ? `${distanceInWords(new Date(npm.time.created), new Date())} ago`
      : "Unknown"
    const updatedTimeStr = npm.time && npm.time.modified
      ? `${distanceInWords(new Date(npm.time.modified), new Date())} ago`
      : createdTimeStr
    // Left
    tableDeets.push({ name: "Updated", message: updatedTimeStr })

    // Right
    tableDeets.push({ name: "Created", message: createdTimeStr })

    tableDeets.push({ break: "row-break" })

    const hasReleases = npm["dist-tags"] && npm["dist-tags"].latest
    const hasMaintainers = npm.maintainers && npm.maintainers.length
    if (hasReleases) {
      tableDeets.push({
        name: "Releases",
        message: String(Object.keys(npm.versions).length),
        ...!hasMaintainers ? { colspan: 2 } : {},
      })
    }
    if (hasMaintainers) {
      tableDeets.push({
        name: "Maintainers",
        message: npm.maintainers.length,
        ...!hasReleases ? { colspan: 2 } : {},
      })
    }
    tableDeets.push({ break: "row-break" })

    if (hasKeywords) {
      const currentTag = npm["dist-tags"].latest
      const tag = npm.versions[currentTag]

      // Whole row
      if (tag.dependencies) {
        const deps = Object.keys(tag.dependencies)
        const depLinks = deps.map(safeLink)
        tableDeets.push({
          name: "Direct <wbr/>Dependencies",
          message: depLinks
            .reduce((accum, link, idx) => {
              if (idx !== 0) {
                accum.push(", <wbr/>")
              }
              accum.push(link)

              return accum
            }, [] as string[])
            .join(""),
          colspan: 3,
        })
        tableDeets.push({ break: "row-break" })
      }
    }

    // Insert any table-content above this point!
    if (isTableRowBreak(tableDeets[tableDeets.length - 1])) {
      // Remove unnecessary row-break
      tableDeets.pop()
    }

    // Outside the table
    let readme = npm.readme ? "This README is too long to show." : ""
    if (npm.readme && npm.readme.length < 10000) {
      readme = `
<details>
<summary><code>README</code></summary></br>

${npm.readme}

</details>
`
    }

    return {
      details: tableDeets,
      readme,
    }
  }
}

// Had to define this as an interface, because prettier would strip semi-colons if I embed at use-site
interface CellOptions {
  colspanToUse?: number
  content: string
}
function renderCell({ colspanToUse = 1, content }: CellOptions) {
  return `<td${colspanToUse !== 1 ? ` colspan="${colspanToUse}"` : ""}> ${content} </td>`
}

/**
 * Little renderer for the npm table details and relies on the data to be provided
 * @private Only exported for testing reasons.
 */
export function _renderNPMTable({
  usedInPackageJSONPaths,
  npmData: { details, readme },
}: {
  usedInPackageJSONPaths: string[]
  npmData: PartiallyRenderedNPMMetadata
}) {
  const rowContent: string[] = [""]
  const unProcessedDetails = details.slice()
  while (unProcessedDetails.length) {
    const deet = unProcessedDetails.shift()!
    const currentRowIndex = rowContent.length - 1

    if (isTableRowBreak(deet)) {
      rowContent.push("")
      continue
    }

    const colspanToUse = Math.max(deet.colspan || 0, 1)
    let content = ""
    if (isTableDeetPlaceholder(deet)) {
      if (deet.placeholderKey === "used-in-packages") {
        content = `<i>Used in ${usedInPackageJSONPaths.map(aPath => "<code>" + aPath + "</code>").join(", ")}<i>`
      }
    } else if (isTableDeetFormatted(deet)) {
      content = deet.content
    } else {
      content = [`<b>${deet.name}:</b>`, deet.message].join(" <wbr/>")
    }
    rowContent[currentRowIndex] += renderCell({ colspanToUse, content })
  }
  return `<table>
${rowContent.map(row => `<tr>${row}</tr>`).join("\n")}
</table>
${readme}
`
}

function renderDepDuplicationCache(cache: DepDuplicationCache) {
  const sentence = danger.utils.sentence

  const newDependencies = Object.keys(cache).sort()
  if (newDependencies.length) {
    markdown(`New dependencies added: ${sentence(newDependencies.map(safeLink))}.`)
  }

  newDependencies
    .map(depName => cache[depName])
    .forEach(({ npmData, yarnBody, packageJSONPaths }) =>
      markdown(
        `${_renderNPMTable({ usedInPackageJSONPaths: packageJSONPaths.sort(), npmData })}${yarnBody
          ? `\n${yarnBody}`
          : ""}`
      )
    )
}

// Ensure a lockfile change if deps/devDeps changes, in case
// someone has only used `npm install` instead of `yarn.
export const checkForLockfileDiff = (packagePath, packageDiff) => {
  if (packageDiff.dependencies || packageDiff.devDependencies) {
    const lockfilePath = packagePath.replace(/package\.json$/, "yarn.lock")
    const lockfileChanged = includes(danger.git.modified_files, lockfilePath)
    if (!lockfileChanged) {
      const message = `Changes were made to ${packagePath}, but not to ${lockfilePath}.`
      const idea = "Perhaps you need to run `yarn install`?"
      warn(`${message}<br/><i>${idea}</i>`)
    }
  }
}

// Don't ship @types dependencies to consumers of Danger
export const checkForTypesInDeps = packageDiff => {
  const sentence = danger.utils.sentence

  if (packageDiff.dependencies && packageDiff.dependencies.added) {
    const typesDeps = packageDiff.dependencies.added.filter(d => d.startsWith("@types/")).map(printDep)
    if (typesDeps.length) {
      const message = `@types dependencies were added to package.json, as a dependency for others.`
      const idea = `You need to move ${sentence(typesDeps)} into "devDependencies"?`
      fail(`${message}<br/><i>${idea}</i>`)
    }
  }
}

export interface Options {
  pathToPackageJSON?: string
  npmAuthToken?: string

  disableCheckForRelease?: boolean
  disableCheckForNewDependencies?: boolean
  disableCheckForLockfileDiff?: boolean
  disableCheckForTypesInDeps?: boolean
}

/** @private Only exported for testing reasons */
export async function _operateOnSingleDiff(
  packagePath: string,
  packageDiff: JSONDiff,
  duplicationCache: DepDuplicationCache,
  options: Options
): Promise<void> {
  if (!options.disableCheckForRelease) {
    checkForRelease(packageDiff)
  }
  if (!options.disableCheckForLockfileDiff) {
    checkForLockfileDiff(packagePath, packageDiff)
  }
  if (!options.disableCheckForTypesInDeps) {
    checkForTypesInDeps(packageDiff)
  }

  if (!options.disableCheckForNewDependencies) {
    await checkForNewDependencies(packagePath, packageDiff, duplicationCache, options.npmAuthToken)
  }
}

/**
 * Provides dependency information on dependency changes in a PR
 */
export default async function yarn(options: Options = {}) {
  const allFiles = [...(danger.git.modified_files || []), ...(danger.git.created_files || [])]

  const packageJsonFiles = allFiles.filter(file => /(^|\/)package\.json$/.test(file))
  const paths = options.pathToPackageJSON ? [options.pathToPackageJSON] : packageJsonFiles

  const depDuplicationCache: DepDuplicationCache = {}
  try {
    await Promise.all(
      paths.map(
        async path =>
          await _operateOnSingleDiff(path, await danger.git.JSONDiffForFile(path), depDuplicationCache, options)
      )
    )
  } catch (e) {
    renderDepDuplicationCache(depDuplicationCache)
    throw e
  }
  renderDepDuplicationCache(depDuplicationCache)
}
