import { JSONDiff } from "../node_modules/danger/distribution/dsl/GitDSL"

import * as mockfs from "fs"
import { checkForLockfileDiff, checkForRelease, checkForTypesInDeps, getNPMMetadataForDep } from "./index"

jest.mock("node-fetch", () => () =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(JSON.parse(mockfs.readFileSync("src/fixtures/danger-npm-info.json", "utf8"))),
  })
)

declare const global: any
beforeEach(() => {
  global.warn = jest.fn()
  global.message = jest.fn()
  global.fail = jest.fn()
  global.markdown = jest.fn()
  global.danger = {
    utils: {
      sentence: jest.fn().mockReturnValue("mocked"),
    },
  }
})

afterEach(() => {
  global.warn = undefined
  global.message = undefined
  global.fail = undefined
  global.markdown = undefined
})

describe("checkForRelease", () => {
  it("Says congrats if there is a package diff version change", () => {
    checkForRelease({ version: { before: "1.0.0", after: "1.0.1" } })
    expect(global.message).toHaveBeenCalledWith(":tada: - congrats on your new release")
  })

  it("Says nothing if there is a no difference in version", () => {
    checkForRelease({ version: { before: "1.0.0", after: "1.0.0" } })
    expect(global.message).toHaveBeenCalledTimes(0)
  })

  it("Says nothing if there is a backslip in version", () => {
    checkForRelease({ version: { before: "1.0.0", after: "0.2.0" } })
    expect(global.message).toHaveBeenCalledTimes(0)
  })

  it("does nothing when there's no version change", () => {
    checkForRelease({})
    expect(global.markdown).toHaveBeenCalledTimes(0)
  })
})

describe("checkForTypesInDeps", () => {
  it("does nothing when there's no dependency changes", () => {
    checkForTypesInDeps({})
    expect(global.fail).toHaveBeenCalledTimes(0)
  })

  it("when there is an @types dependency, it should call fail", () => {
    const deps: JSONDiff = {
      dependencies: {
        before: [],
        after: ["@types/danger"],
        added: ["@types/danger"],
      },
    }
    checkForTypesInDeps(deps)
    expect(global.fail).toHaveBeenCalledTimes(1)
  })
})

describe("checkForLockfileDiff", () => {
  it("does nothing when there's no dependency changes", () => {
    checkForLockfileDiff({})
    expect(global.warn).toHaveBeenCalledTimes(0)
  })

  it("when there are dependency changes, and no lockfile in modified - warn", () => {
    global.danger = { git: { modified_files: [] } }
    const deps: JSONDiff = {
      dependencies: {
        before: [],
        after: [],
      },
    }
    checkForLockfileDiff(deps)
    expect(global.warn).toHaveBeenCalledTimes(1)
  })

  it("when there are dependency changes, and a lockfile in modified - do not warn", () => {
    global.danger = { git: { modified_files: ["yarn.lock"] } }
    const deps: JSONDiff = {
      dependencies: {
        before: [],
        after: [],
      },
    }
    checkForLockfileDiff(deps)
    expect(global.warn).toHaveBeenCalledTimes(0)
  })
})

describe("npm metadata", () => {
  it("Shows a bunch of useful text for a new dep", async () => {
    const defaultConfig = {
      registry: "https://registry.npmjs.org/",
    }
    const data = await getNPMMetadataForDep("danger", defaultConfig)
    expect(data).toMatchSnapshot()
  })
})
