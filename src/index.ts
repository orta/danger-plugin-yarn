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
import fetch from "node-fetch"
import semver from "semver"
import { URL } from "url"
import { promisify } from "util"

import includesOriginal from "lodash.includes"

import { getProxyAgentFromUri } from "./getProxyAgentFromUri"
import { getRegistries, Registry } from "./getRegistries"
import { getYarnConfig, YarnConfig } from "./getYarnConfig"

type IncludesFn = <TValue>(collection: Array<TValue>, value: TValue) => boolean

const exec = promisify(child_process.exec)
const includes: IncludesFn = includesOriginal

const escapePackage = (name: string): string => name.replace(/@/, "&#64;")
const linkToNPM = (name: string): string => `https://www.npmjs.com/package/${name}`

const defaultRenderPackageLink = (name: string): string => `<a href='${linkToNPM(name)}'>\`${escapePackage(name)}\`</a>`

const defaultRenderReadme = npm => `
<details>
<summary><code>README</code></summary></br>

${npm.readme}

</details>
`

const defaultRenderPackageDetails = (pkg: string, npm: NpmPackageJson, tableDeets: PackageDetails, readme: string) => {
  const homepage = npm.homepage ? npm.homepage : `http://npmjs.com/package/${escapePackage(pkg)}`
  return `
<h2><a href="${homepage}">${escapePackage(pkg)}</a></h2>
<p>Author: ${npm.author && npm.author.name ? npm.author.name : "Unknown"}</p>
<p>Description: ${npm.description}</p>
<p>Homepage: <a href="${homepage}">${homepage}</a></p>

<table>
<thead><tr><th></th><th width="100%"></th></tr></thead>
${tableDeets.map(deet => `<tr><td>${deet.name}</td><td>${deet.message}</td></tr>`).join("")}
</table>
${readme}
`
}

const defaultRenderMessage = (msg: string, idea: string): string => `${msg}<br/><i>${idea}</i>`

const defaultRenderYarnWhy = (dep: string, infoMessages: ReadonlyArray<string>): string => `
<details>
  <summary><code>yarn why ${escapePackage(dep)}</code> output</summary>
  <ul><li><code>${infoMessages.join("</code></li><li><code>")}</code></li></ul>
</details>
`

// Celebrate when a new release is being shipped
export const checkForRelease = (packageDiff: JSONDiff, options: Options = {}): void => {
  if (packageDiff.version && packageDiff.version.before && packageDiff.version.after) {
    if (semver.lt(packageDiff.version.before, packageDiff.version.after)) {
      message(":tada: - congrats on your new release")
    }
  }
}

// Initial stab at showing information about a new dependency
export const checkForNewDependencies = async (
  packageDiff: JSONDiff,
  config: YarnConfig,
  options: Options = {}
): Promise<void> => {
  const sentence = danger.utils.sentence
  const { renderPackageLink = defaultRenderPackageLink } = options

  const newDependencies = findNewDependencies(packageDiff)

  if (newDependencies.length) {
    markdown(`New dependencies added: ${sentence(newDependencies.map(renderPackageLink))}.`)
  }

  for (const dep of newDependencies) {
    // Pump out a bunch of metadata information
    const npm = await getNPMMetadataForDep(dep, config, options)
    if (npm && npm.length) {
      markdown(npm)
    } else if (dep) {
      warn(`Could not get info from npm on ${renderPackageLink(dep)}</a>`)
    }

    if ("undefined" === typeof peril) {
      const yarnWhyMetadata = await getYarnMetadataForDep(dep)
      if (yarnWhyMetadata && yarnWhyMetadata.length) {
        markdown(yarnWhyMetadata)
      } else if (dep) {
        warn(`Could not get info from yarn on ${renderPackageLink(dep)}`)
      }
    }
  }
}

export const findNewDependencies = (packageDiff: JSONDiff): Array<string> => {
  const added: Array<string> = []
  for (const element of [packageDiff.dependencies, packageDiff.devDependencies]) {
    if (element && element.added && element.added.length) {
      added.push.apply(added, element.added)
    }
  }
  return added
}

export interface YarnWhyMessage {
  type: "activityStart" | "activityTick" | "activityEnd" | "step" | "info"
  data: object | string
}

export const getYarnMetadataForDep = async (
  dep: string,
  { renderYarnWhy = defaultRenderYarnWhy }: Options = {}
): Promise<string> => {
  const { stdout } = await exec(`yarn why '${dep}' --json`)

  if (stdout) {
    // Comes as a series of little JSON messages
    const whyMessages: ReadonlyArray<YarnWhyMessage> = stdout.split("\n").map(line => JSON.parse(line.trim()))

    const infoMessages = whyMessages.filter(msg => msg.type === "info").map(m => m.data) as ReadonlyArray<string>
    return renderYarnWhy(dep, infoMessages)
  } else {
    return ""
  }
}

type PackageDetails = Array<{
  readonly name: string
  readonly message: string
}>

type NpmPackageJson = {
  readonly time?: {
    readonly created?: string
    readonly modified?: string
  }
  readonly "dist-tags"?: {
    readonly latest?: string
  }
  readonly versions: {
    readonly [currentTag: string]: {
      readonly dependencies: {
        readonly [packageName: string]: string
      }
    }
  }
  readonly license?: string
  readonly author?: {
    readonly name?: string
  }
  readonly maintainers?: string
  readonly homepage?: string
  readonly description?: string
  readonly readme?: string
  readonly keywords: Array<string>
}

export const getNPMMetadataForDep = async (
  dep: string,
  config: YarnConfig,
  {
    npmAuthToken,
    renderPackageLink = defaultRenderPackageLink,
    renderReadme = defaultRenderReadme,
    renderPackageDetails = defaultRenderPackageDetails,
  }: Options = {}
): Promise<string | undefined> => {
  const sentence = danger.utils.sentence

  // Note: NPM can't handle encoded '@'
  const urlDep = encodeURIComponent(dep).replace("%40", "@")

  const registries = getRegistries(config)

  // Configure the default registry.
  let registry: Registry = registries.default
  if (npmAuthToken) {
    registry = { ...registries.default, authToken: npmAuthToken }
  }

  // If the dependency belongs to a scope assigned to a different registry use that instead.
  const hasScope = dep.startsWith("@")
  if (hasScope) {
    const [scopeName] = dep.split("/")
    registry = registries[scopeName]
  }

  const uri = new URL(`${registry.url}/${urlDep}`)
  const agent = getProxyAgentFromUri(uri, config)

  const headers = registry.authToken ? { Authorization: `Bearer ${registry.authToken}` } : undefined
  const npmResponse = await fetch(uri.toString(), { agent, headers })

  if (npmResponse.ok) {
    const tableDeets: PackageDetails = []
    const npm: NpmPackageJson = await npmResponse.json()

    if (npm.time && npm.time.created) {
      const distance = distanceInWords(new Date(npm.time.created), new Date())
      tableDeets.push({ name: "Created", message: `${distance} ago` })
    }

    if (npm.time && npm.time.modified) {
      const distance = distanceInWords(new Date(npm.time.modified), new Date())
      tableDeets.push({
        name: "Last Updated",
        message: `${distance} ago`,
      })
    }

    const license = npm.license
    if (license) {
      tableDeets.push({ name: "License", message: license })
    } else {
      tableDeets.push({
        name: "License",
        message: "**NO LICENSE FOUND**",
      })
    }

    if (npm.maintainers) {
      tableDeets.push({
        name: "Maintainers",
        message: String(npm.maintainers.length),
      })
    }

    if (npm["dist-tags"] && npm["dist-tags"].latest) {
      const currentTag = npm["dist-tags"].latest
      const tag = npm.versions[currentTag]
      tableDeets.push({
        name: "Releases",
        message: String(Object.keys(npm.versions).length),
      })

      if (tag.dependencies) {
        const deps = Object.keys(tag.dependencies)
        const depLinks = deps.map(renderPackageLink)
        tableDeets.push({
          name: "Direct Dependencies",
          message: sentence(depLinks),
        })
      }
    }

    if (npm.keywords && npm.keywords.length) {
      tableDeets.push({
        name: "Keywords",
        message: sentence(npm.keywords),
      })
    }

    let readme = ""
    if (npm.readme) {
      if (npm.readme.length < 10000) {
        readme = renderReadme(npm)
      } else {
        readme = "This README is too long to show."
      }
    }

    return renderPackageDetails(dep, npm, tableDeets, readme)
  }
}

// Ensure a lockfile change if deps/devDeps changes, in case
// someone has only used `npm install` instead of `yarn.
export const checkForLockfileDiff = (
  packageDiff: JSONDiff,
  { renderMessage = defaultRenderMessage }: Options = {}
): void => {
  if (packageDiff.dependencies || packageDiff.devDependencies) {
    const lockfileChanged = includes(danger.git.modified_files, "yarn.lock")
    if (!lockfileChanged) {
      const msg = "Changes were made to package.json, but not to yarn.lock."
      const idea = "Perhaps you need to run `yarn install`?"
      warn(renderMessage(msg, idea))
    }
  }
}

// Don't ship @types dependencies to consumers of Danger
export const checkForTypesInDeps = (
  packageDiff: JSONDiff,
  { renderMessage = defaultRenderMessage }: Options = {}
): void => {
  const sentence = danger.utils.sentence

  if (packageDiff.dependencies && packageDiff.dependencies.added) {
    const typesDeps = packageDiff.dependencies.added.filter(d => d.startsWith("@types/")).map(escapePackage)
    if (typesDeps.length) {
      const msg = `@types dependencies were added to package.json, as a dependency for others.`
      const idea = `You need to move ${sentence(typesDeps)} into "devDependencies"?`
      fail(renderMessage(msg, idea))
    }
  }
}

export interface Options {
  pathToRootPackageJSON?: string
  pathToPackageJSON?: string | ReadonlyArray<string>
  npmAuthToken?: string
  renderPackageDetails?: typeof defaultRenderPackageDetails
  renderReadme?: typeof defaultRenderReadme
  renderYarnWhy?: typeof defaultRenderYarnWhy
  renderMessage?: typeof defaultRenderMessage
  renderPackageLink?: typeof defaultRenderPackageLink
}

/**
 * Provides dependency information on dependency changes in a PR
 */
export default async function yarn(options: Options = {}): Promise<void> {
  const pathToRootPackageJSON = options.pathToRootPackageJSON ? options.pathToRootPackageJSON : "package.json"

  let pathToPackageJSONs: ReadonlyArray<string>
  if (options.pathToPackageJSON) {
    pathToPackageJSONs = Array.isArray(options.pathToPackageJSON)
      ? options.pathToPackageJSON
      : [options.pathToPackageJSON]
  } else {
    const isNonRootPackageJson = (path: string) => path.endsWith("package.json") && path !== pathToRootPackageJSON

    pathToPackageJSONs = Array.from(
      new Set([...danger.git.created_files, ...danger.git.modified_files].filter(isNonRootPackageJson))
    )
  }

  const rootPackageDiff = await danger.git.JSONDiffForFile(pathToRootPackageJSON)
  const packageDiffs: ReadonlyArray<JSONDiff> = await Promise.all(
    pathToPackageJSONs.map(
      (pathToPackageJSON: string): Promise<JSONDiff> => danger.git.JSONDiffForFile(pathToPackageJSON)
    )
  )

  checkForLockfileDiff(rootPackageDiff)

  const config = await getYarnConfig()
  for (const packageDiff of packageDiffs) {
    checkForRelease(packageDiff, options)
    checkForTypesInDeps(packageDiff, options)

    await checkForNewDependencies(packageDiff, config, options)
  }
}
