// Provides dev-time typing structure for  `danger` - doesn't affect runtime.
import { DangerDSLType } from "../node_modules/danger/distribution/dsl/DangerDSL"
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

// Initial stab at showing information about a new dependency
export const checkForNewDependencies = async (packageDiff, npmAuthToken?: string) => {
  const sentence = danger.utils.sentence
  const added = [] as string[]
  const newDependencies = findNewDependencies(packageDiff)

  if (newDependencies.length) {
    markdown(`New dependencies added: ${sentence(newDependencies.map(safeLink))}.`)
  }

  for (const dep of newDependencies) {
    // Pump out a bunch of metadata information
    const npm = await getNPMMetadataForDep(dep, npmAuthToken)
    if (npm && npm.length) {
      markdown(npm)
    } else if (dep) {
      warn(`Could not get info from npm on ${safeLink(dep)}</a>`)
    }

    if ("undefined" === typeof peril) {
      const yarn = await getYarnMetadataForDep(dep)
      if (yarn && yarn.length) {
        markdown(yarn)
      } else if (dep) {
        warn(`Could not get info from yarn on ${safeLink(dep)}`)
      }
    }
  }
}

export const findNewDependencies = packageDiff => {
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

export const getNPMMetadataForDep = async (dep, npmAuthToken?: string) => {
  const sentence = danger.utils.sentence

  // Note: NPM can't handle encoded '@'
  const urlDep = encodeURIComponent(dep).replace("%40", "@")

  const headers = npmAuthToken ? { Authorization: `Bearer ${npmAuthToken}` } : undefined
  const npmResponse = await fetch(`https://registry.npmjs.org/${urlDep}`, { headers })

  if (npmResponse.ok) {
    const tableDeets = [] as Array<{ name: string; message: string }>
    const npm = await npmResponse.json()

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
        message: "<b>NO LICENSE FOUND</b>",
      })
    }

    if (npm.maintainers) {
      tableDeets.push({
        name: "Maintainers",
        message: npm.maintainers.length,
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
        const depLinks = deps.map(safeLink)
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

    let readme = npm.readme ? "This README is too long to show." : ""
    if (npm.readme && npm.readme.length < 10000) {
      readme = `
<details>
<summary><code>README</code></summary></br>

${npm.readme}

</details>
`
    }

    const homepage = npm.homepage ? npm.homepage : `http://npmjs.com/package/${dep}`

    return `
<h2><a href="${homepage}">${printDep(dep)}</a></h2>
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
}
// Ensure a lockfile change if deps/devDeps changes, in case
// someone has only used `npm install` instead of `yarn.
export const checkForLockfileDiff = packageDiff => {
  if (packageDiff.dependencies || packageDiff.devDependencies) {
    const lockfileChanged = includes(danger.git.modified_files, "yarn.lock")
    if (!lockfileChanged) {
      const message = "Changes were made to package.json, but not to yarn.lock."
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
}

/**
 * Provides dependency information on dependency changes in a PR
 */
export default async function yarn(options: Options = {}) {
  const path = options.pathToPackageJSON ? options.pathToPackageJSON : "package.json"
  const packageDiff = await danger.git.JSONDiffForFile(path)

  checkForRelease(packageDiff)
  checkForLockfileDiff(packageDiff)
  checkForTypesInDeps(packageDiff)

  await checkForNewDependencies(packageDiff, options.npmAuthToken)
}
