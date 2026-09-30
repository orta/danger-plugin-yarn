import * as child_process from "child_process"
import * as mockfs from "fs"
jest.mock("node-fetch", () => (url: string) => {
  const readFixture = (requestUrl: string) => {
    const dep = requestUrl.split("/").pop() || "danger"
    const fixturePath = `src/fixtures/${dep}-npm-info.json`
    const fallbackFixturePath = "src/fixtures/danger-npm-info.json"

    try {
      return JSON.parse(mockfs.readFileSync(fixturePath, "utf8"))
    } catch (error) {
      return JSON.parse(mockfs.readFileSync(fallbackFixturePath, "utf8"))
    }
  }

  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(readFixture(url)),
  })
})

import yarn, {
  _operateOnSingleDiff,
  _renderNPMTable,
  checkForLockfileDiff,
  checkForRelease,
  checkForTypesInDeps,
  getNPMMetadataForDep,
  getYarnMetadataForDep,
} from "./index"

const RealDate = Date
const FIXED_NOW = "2022-04-21T00:00:00.000Z"

const yarnClassicWhyOutput = [
  `{"type":"step","data":{"message":"Why do we have the module \\"my-new-dependency\\"?","current":1,"total":4}}`,
  `{"type":"step","data":{"message":"Initialising dependency graph","current":2,"total":4}}`,
  `{"type":"warning","data":"my-new-dependency@1.0.0: this package is deprecated"}`,
  `{"type":"step","data":{"message":"Finding dependency","current":3,"total":4}}`,
  `{"type":"step","data":{"message":"Calculating file sizes","current":4,"total":4}}`,
  `{"type":"info","data":"\\r=> Found \\"my-new-dependency@1.0.0\\""}`,
  `{"type":"info","data":"This module exists because it's specified in \\"dependencies\\"."}`,
  `{"type":"info","data":"Disk size without dependencies: \\"72KB\\""}`,
  "",
].join("\n")

const mockYarnWhy = (err: any, output: string) => {
  const implementation = (file, args, callback) => {
    callback(err, output, "")
    return {} as any
  }
  return jest.spyOn(child_process, "execFile").mockImplementation(implementation as any)
}

declare const global: any
beforeEach(() => {
  global.warn = jest.fn()
  global.message = jest.fn()
  global.fail = jest.fn()
  global.markdown = jest.fn()
  global.danger = { utils: { sentence: jest.fn() } }
  global.Date = class extends RealDate {
    static now() {
      return new RealDate(FIXED_NOW).getTime()
    }

    constructor(value?: any) {
      if (arguments.length) {
        super(value)
      } else {
        super(FIXED_NOW)
      }
    }
  }
  mockYarnWhy(null, yarnClassicWhyOutput)
})

afterEach(() => {
  global.warn = undefined
  global.message = undefined
  global.fail = undefined
  global.markdown = undefined
  global.peril = undefined
  global.Date = RealDate
  const execFileSpy = child_process.execFile as any
  if (execFileSpy.mockRestore) {
    execFileSpy.mockRestore()
  }
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
    expect.assertions(1)
    const npmData = await getNPMMetadataForDep("danger")
    expect(_renderNPMTable({ usedInPackageJSONPaths: ["package.json"], npmData: npmData! })).toMatchSnapshot()
  })

  it("Shows a version license when top-level license is missing", async () => {
    expect.assertions(2)
    const npmData = await getNPMMetadataForDep("pinpoint")
    const rendered = _renderNPMTable({ usedInPackageJSONPaths: ["package.json"], npmData: npmData! })

    expect(rendered).toContain("<b>License:</b> <wbr/>MIT")
    expect(rendered).not.toContain("<b>NO LICENSE FOUND</b>")
  })
})

describe("yarn metadata", () => {
  it("passes dependency names to yarn why without using a shell command string", async () => {
    const dep = "danger'; touch SUCCESS; #"
    const execFileSpy = child_process.execFile as any
    execFileSpy.mockClear()
    execFileSpy.mockImplementation(
      ((file, args, callback) => {
        expect(file).toBe(process.platform === "win32" ? "yarn.cmd" : "yarn")
        expect(args).toEqual(["why", dep, "--json"])
        callback(null, `{"type":"activityEnd","data":{"id":0}}\n{"type":"info","data":"Found why output"}`, "")
        return {} as any
      }) as any
    )

    const result = await getYarnMetadataForDep(dep)

    expect(execFileSpy).toHaveBeenCalledTimes(1)
    expect(result).toContain("Found why output")
  })

  it("renders the info lines from Yarn 1", async () => {
    const result = await getYarnMetadataForDep("my-new-dependency")

    expect(result).toContain(`<li><code>=&gt; Found "my-new-dependency@1.0.0"</code></li>`)
    expect(result).toContain(`<li><code>This module exists because it's specified in "dependencies".</code></li>`)
    expect(result).not.toContain("deprecated")
    expect(result).not.toContain("Calculating file sizes")
  })

  it("renders the reasons list from Yarn 1", async () => {
    const output = [
      `{"type":"info","data":"Reasons this module exists"}`,
      JSON.stringify({
        type: "list",
        data: { type: "reasons", items: [`Specified in "dependencies"`, `Hoisted from "other#my-new-dependency"`] },
      }),
      "",
    ].join("\n")
    mockYarnWhy(null, output)

    const result = await getYarnMetadataForDep("my-new-dependency")

    expect(result).toContain(`<li><code>Specified in "dependencies"</code></li>`)
    expect(result).toContain(`<li><code>Hoisted from "other#my-new-dependency"`)
  })

  it("renders the dependents reported by Yarn 2+", async () => {
    const output = [
      JSON.stringify({
        value: "app@workspace:.",
        children: {
          "my-new-dependency@npm:1.0.0": {
            locator: "my-new-dependency@npm:1.0.0",
            descriptor: "my-new-dependency@npm:>=1 <2",
          },
        },
      }),
      JSON.stringify({
        value: "other@npm:3.0.1",
        children: {
          "my-new-dependency@npm:1.0.0": {
            locator: "my-new-dependency@npm:1.0.0",
            descriptor: "my-new-dependency@npm:^1.0.0",
          },
        },
      }),
      "",
    ].join("\n")
    mockYarnWhy(null, output)

    const result = await getYarnMetadataForDep("my-new-dependency")

    expect(result).toContain(`<li><code>"app@workspace:." depends on "my-new-dependency@npm:&gt;=1 &lt;2"</code></li>`)
    expect(result).toContain(`<li><code>"other@npm:3.0.1" depends on "my-new-dependency@npm:^1.0.0"`)
  })

  it("resolves an empty string when Yarn 1 has no match for the dependency", async () => {
    const output = [
      `{"type":"step","data":{"message":"Why do we have the module \\"my-new-dependency\\"?","current":1,"total":4}}`,
      `{"type":"step","data":{"message":"Initialising dependency graph","current":2,"total":4}}`,
      `{"type":"step","data":{"message":"Finding dependency","current":3,"total":4}}`,
      "",
    ].join("\n")
    mockYarnWhy(null, output)

    expect(await getYarnMetadataForDep("my-new-dependency")).toBe("")
  })

  it("resolves an empty string when Yarn 2+ has no match for the dependency", async () => {
    mockYarnWhy(null, "")

    expect(await getYarnMetadataForDep("my-new-dependency")).toBe("")
  })

  it("resolves undefined when yarn is not installed", async () => {
    mockYarnWhy(Object.assign(new Error("spawn yarn ENOENT"), { code: "ENOENT" }), "")

    expect(await getYarnMetadataForDep("my-new-dependency")).toBeUndefined()
  })

  it("resolves undefined when there is no yarn.lock", async () => {
    const output = [
      `{"type":"error","data":"No lockfile in this directory. Run \`yarn install\` to generate one."}`,
      `{"type":"info","data":"Visit https://yarnpkg.com/en/docs/cli/why for documentation about this command."}`,
      "",
    ].join("\n")
    mockYarnWhy(Object.assign(new Error("Command failed"), { code: 1 }), output)

    expect(await getYarnMetadataForDep("my-new-dependency")).toBeUndefined()
  })

  it("resolves undefined when the project pins a different Yarn version", async () => {
    const output = [
      JSON.stringify({
        type: "error",
        data:
          `This project's package.json defines "packageManager": "yarn@4.18.1". ` +
            "However the current global version of Yarn is 1.22.22.",
      }),
      "",
      `Presence of the "packageManager" field indicates that the project is meant to be used with Corepack.`,
      "",
    ].join("\n")
    mockYarnWhy(Object.assign(new Error("Command failed"), { code: 1 }), output)

    expect(await getYarnMetadataForDep("my-new-dependency")).toBeUndefined()
  })

  it("resolves undefined when yarn cannot be spawned", async () => {
    jest.spyOn(child_process, "execFile").mockImplementation(() => {
      throw Object.assign(new Error("spawn EINVAL"), { code: "EINVAL" })
    })

    expect(await getYarnMetadataForDep("my-new-dependency")).toBeUndefined()
  })
})

describe("checkForNewDependencies yarn why", () => {
  const addDependency = () => {
    global.danger.utils.sentence = (...args) => args.join(", ")
    global.danger.git = {
      modified_files: ["package.json", "yarn.lock"],
      created_files: [],
      JSONDiffForFile: jest.fn(() => ({
        dependencies: {
          before: {},
          after: { "my-new-dependency": "^1.0.0" },
          added: ["my-new-dependency"],
        },
      })),
    }
  }

  it("runs yarn why under Danger, which defines peril as an empty object", async () => {
    global.peril = {}
    addDependency()

    await yarn()

    expect(child_process.execFile).toHaveBeenCalledTimes(1)
    expect(global.warn).toHaveBeenCalledTimes(0)
    const rendered = global.markdown.mock.calls[1][0]
    expect(rendered).toContain("<summary><code>yarn why my-new-dependency</code> output</summary>")
    expect(rendered).toContain(`<li><code>=&gt; Found "my-new-dependency@1.0.0"</code></li>`)
  })

  it("skips yarn why under Peril", async () => {
    global.peril = { env: {}, runTask: jest.fn() }
    addDependency()

    await yarn()

    expect(child_process.execFile).toHaveBeenCalledTimes(0)
    expect(global.warn).toHaveBeenCalledTimes(0)
    expect(global.markdown.mock.calls[1][0]).not.toContain("yarn why")
  })

  it("warns when yarn has no match for the dependency", async () => {
    global.peril = {}
    addDependency()
    mockYarnWhy(null, "")

    await yarn()

    expect(global.warn).toHaveBeenCalledTimes(1)
    expect(global.warn.mock.calls[0][0]).toMatch(/Could not get info from yarn/)
    expect(global.markdown.mock.calls[1][0]).not.toContain("yarn why")
  })

  it("stays silent when yarn cannot run in this checkout", async () => {
    global.peril = {}
    addDependency()
    mockYarnWhy(Object.assign(new Error("spawn yarn ENOENT"), { code: "ENOENT" }), "")

    await yarn()

    expect(global.warn).toHaveBeenCalledTimes(0)
    expect(global.markdown.mock.calls[1][0]).not.toContain("yarn why")
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
  })
})
