import * as mockfs from "fs"

import yarn, {
  _operateOnSingleDiff,
  _renderNPMTable,
  checkForLockfileDiff,
  checkForNewDependencies,
  checkForRelease,
  checkForTypesInDeps,
} from "./index"

const provideFixture = (fixture: string) => {
  return () => () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(JSON.parse(mockfs.readFileSync(`src/fixtures/${fixture}.json`, "utf8"))),
  })
};

const fixtureDangerNpmInfo = provideFixture("danger-npm-info");
const fixturePinpointNpmInfo = provideFixture("pinpoint-npm-info");

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
    checkForLockfileDiff("package.json", {})
    expect(global.warn).toHaveBeenCalledTimes(0)
  })

  it("when there are dependency changes, and no lockfile in modified - warn", () => {
    global.danger = { git: { modified_files: [] } }
    const deps = {
      dependencies: {},
    }
    checkForLockfileDiff("package.json", deps)
    expect(global.warn).toHaveBeenCalledTimes(1)
  })

  it("when there are dependency changes, and a lockfile in modified - do not warn", () => {
    global.danger = { git: { modified_files: ["yarn.lock"] } }
    const deps = { dependencies: {} }
    checkForLockfileDiff("package.json", deps)
    expect(global.warn).toHaveBeenCalledTimes(0)
  })

  it("detects changes from multiple package.json files", async () => {
    expect.assertions(6)
    global.danger.utils.sentence = (...args) => args.join(", ")
    global.danger.git = {
      modified_files: ["package.json"],
      created_files: ["packages/my-other-package/package.json"],
      JSONDiffForFile: jest.fn(() => ({
        dependencies: {
          before: {},
          after: {
            "my-new-dependency": "^1.0.0",
          },
          added: ["my-new-dependency"],
        },
      })),
    }

    await yarn()

    expect(global.warn).toHaveBeenCalledTimes(2)
    expect(global.warn.mock.calls[0][0]).toMatch(/.*Changes were made to package.json.*/)
    expect(global.warn.mock.calls[1][0]).toMatch(/.*Changes were made to packages\/my-other-package\/package.json.*/)
    expect(global.markdown).toHaveBeenCalledTimes(2)
    expect(global.markdown.mock.calls[0][0]).toMatchSnapshot()
    expect(global.markdown.mock.calls[1][0]).toMatchSnapshot()
  })
})

describe("npm metadata", () => {
  it("Shows a bunch of useful text for a new dep", async () => {
    jest.mock("node-fetch", () => () => fixtureDangerNpmInfo)
    expect.assertions(1)
    const npmData = await getNPMMetadataForDep("danger")
    expect(_renderNPMTable({ usedInPackageJSONPaths: ["package.json"], npmData: npmData! })).toMatchSnapshot()
  })
})

describe("Feature Flags", () => {
  it("should skip checkForRelease if options.disableCheckForRelease is provided", async () => {
    await _operateOnSingleDiff(
      "package.json",
      { version: { before: "1.0.0", after: "1.0.1" } },
      {},
      { disableCheckForRelease: true }
    )

    expect(global.message).toHaveBeenCalledTimes(0)
    expect(global.warn).toHaveBeenCalledTimes(0)
    expect(global.fail).toHaveBeenCalledTimes(0)
    expect(global.markdown).toHaveBeenCalledTimes(0)
  })
  it("should skip checkForLockFileDiff if options.disableCheckForLockfileDiff is provided", async () => {
    global.danger.git = { modified_files: [] }
    const deps = {
      dependencies: { before: {}, after: {} },
    }
    await _operateOnSingleDiff("package.json", deps, {}, { disableCheckForLockfileDiff: true })

    expect(global.message).toHaveBeenCalledTimes(0)
    expect(global.warn).toHaveBeenCalledTimes(0)
    expect(global.fail).toHaveBeenCalledTimes(0)
    expect(global.markdown).toHaveBeenCalledTimes(0)
  })
  it("should skip checkForTypesInDeps if options.disableCheckForTypesInDeps is provided", async () => {
    global.danger.git = { modified_files: [] }
    const deps = {
      dependencies: {
        added: ["@types/danger"],
        before: {},
        after: {},
      },
    }
    await _operateOnSingleDiff("package.json", deps, {}, { disableCheckForTypesInDeps: true })

    expect(global.message).toHaveBeenCalledTimes(0)
    expect(global.warn).toHaveBeenCalledTimes(1) // Called with "Changes were made to package.json, but not "
    expect(global.fail).toHaveBeenCalledTimes(0)
  })
  it("should skip checkForNewDependencies if options.disableCheckForNewDependencies is provided", async () => {
    global.danger.git = {
      modified_files: ["package.json"],
      created_files: ["packages/my-other-package/package.json"],
      JSONDiffForFile: jest.fn(() => ({
        dependencies: {
          before: {},
          after: {
            "my-new-dependency": "^1.0.0",
          },
        },
      })),
    }

    await yarn({ disableCheckForNewDependencies: true })

    expect(global.message).toHaveBeenCalledTimes(0)
    expect(global.warn).toHaveBeenCalledTimes(2) // Called with "Changes were made to package.json, but not […]"
    expect(global.fail).toHaveBeenCalledTimes(0)

    it("looks through versions if license is missing", async () => {
    jest.mock("node-fetch", fixturePinpointNpmInfo)
    const { getNPMMetadataForDep } = require("./")
    const data = await getNPMMetadataForDep("pinpoint")
    expect(data).toMatchSnapshot()
  })
})
