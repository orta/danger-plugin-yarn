import * as mockfs from "fs"
jest.mock("node-fetch", () => () =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(JSON.parse(mockfs.readFileSync("src/fixtures/danger-npm-info.json", "utf8"))),
  })
)

import yarn, {
  checkForLockfileDiff,
  checkForNewDependencies,
  checkForRelease,
  checkForTypesInDeps,
  getNPMMetadataForDep,
} from "./index"

declare const global: any
beforeEach(() => {
  global.warn = jest.fn()
  global.message = jest.fn()
  global.fail = jest.fn()
  global.markdown = jest.fn()
  global.danger = { utils: { sentence: jest.fn() } }
})

afterEach(() => {
  global.warn = undefined
  global.message = undefined
  global.fail = undefined
  global.markdown = undefined
})

describe("checkForRelease", () => {
  it("Says congrats if there is a package diff version change", () => {
    checkForRelease({ version: {} })
    expect(global.message).toHaveBeenCalledWith(":tada: - congrats on your new release")
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
    const deps = {
      dependencies: {
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
    const deps = {
      dependencies: {},
    }
    checkForLockfileDiff(deps)
    expect(global.warn).toHaveBeenCalledTimes(1)
  })

  it("when there are dependency changes, and a lockfile in modified - do not warn", () => {
    global.danger = { git: { modified_files: ["yarn.lock"] } }
    const deps = { dependencies: {} }
    checkForLockfileDiff(deps)
    expect(global.warn).toHaveBeenCalledTimes(0)
  })
})

describe("npm metadata", () => {
  it("Shows a bunch of useful text for a new dep", async () => {
    const data = await getNPMMetadataForDep("danger")
    expect(data).toMatchSnapshot()
  })
})
