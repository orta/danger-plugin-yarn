// Provides dev-time typing structure for  `danger` - doesn't affect runtime.
import { DangerDSLType } from "../node_modules/danger/distribution/dsl/DangerDSL"
declare var danger: DangerDSLType
export declare function message(message: string): void
export declare function warn(message: string): void
export declare function fail(message: string): void
export declare function markdown(message: string): void

import * as child_process from "child_process"
import { distanceInWords } from "date-fns"
import * as includesOriginal from "lodash.includes"
import * as fetch from "node-fetch"
import * as semver from "semver"
const includes = includesOriginal as any

// Celebrate when a new release is being shipped
export const checkForRelease = packageDiff => {
  if (packageDiff.version) {
    markdown(":tada:")
  }
}

// Initial stab at showing information about a new dependency
export const checkForNewDependencies = async packageDiff => {
  const sentence = danger.utils.sentence

  for (const element of [packageDiff.dependencies, packageDiff.devDependencies]) {
    if (element) {
      if (element.added.length) {
        const newDependencies = element.added
        warn(`New dependencies added: ${sentence(newDependencies)}.`)

        for (const dep of newDependencies) {
          // Pump out a bunch of metadata information
          const npm = await getNPMMetadataForDep(dep)
          if (npm && npm.length) {
            markdown(npm)
          } else {
            warn(`Could not get info from npm on ${dep}`)
          }

          // This isn't a gerat way to check, maybe peril should be something you
          // can 'pull' out of the danger import?
          if (!process.env.PERIL_BOT_USER_ID) {
            const yarn = await getYarnMetadataForDep(dep)
            if (yarn && yarn.length) {
              markdown(yarn)
            } else {
              warn(`Could not get info from yarn on ${dep}`)
            }
          }
        }
      }
    }
  }
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
    <summary><code>yarn why ${dep}</code> output</summary>
    <p><code><ul><li>${messages.join("</li><li>")}
    </li></ul></code></p>
  </details>
  `)
      } else {
        resolve("")
      }
    })
  })
}

export const getNPMMetadataForDep = async dep => {
  const sentence = danger.utils.sentence
  const urlDep = encodeURIComponent(dep)
  const npmResponse = await fetch(`https://registry.npmjs.org/${urlDep}`, {})
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

    if (npm.license) {
      tableDeets.push({ name: "License", message: npm.license })
    } else {
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
        const depLinks = deps.map(d => `<a href='http: //npmjs.com/package/${d}'>${d}</a>`)
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
<summary><code>README</code></summary>
${npm.readme}
</details>
`
    }

    const homepage = npm.homepage ? npm.homepage : `http://npmjs.com/package/${dep}`

    return `
<h2><a href="${homepage}">${dep}</a></h2>
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

  if (packageDiff.dependencies) {
    const typesDeps = packageDiff.dependencies.added.filter(d => d.startsWith("@types"))
    if (typesDeps.length) {
      const message = `@types dependencies were added to package.json, as a dependency for others.`
      const idea = `You need to move ${sentence(typesDeps)} into "devDependencies"?`
      fail(`${message}<br/><i>${idea}</i>`)
    }
  }
}

/**
 * Provides dependency information on dependency changes in a PR
 */
export default async function yarn(pathToPackageJSON?: string) {
  const path = pathToPackageJSON ? pathToPackageJSON : "package.json"
  const packageDiff = await danger.git.JSONDiffForFile(path)

  checkForRelease(packageDiff)
  checkForLockfileDiff(packageDiff)
  checkForTypesInDeps(packageDiff)

  await checkForNewDependencies(packageDiff)
}
