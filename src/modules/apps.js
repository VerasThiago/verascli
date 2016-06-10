import log from '../logger'
import Table from 'cli-table'
import inquirer from 'inquirer'
import readline from 'readline'
import {Promise} from 'bluebird'
import pkg from '../../package.json'
import {logChanges} from '../sandbox-utils'
import {getDevWorkspace} from '../workspace-utils'
import {getToken, getAccount, getLogin} from '../conf'
import {
  WorkspaceAppsClient,
  WorkspaceSandboxesClient,
  SandboxesClient,
} from '@vtex/apps'
import {
  vendorPattern,
  namePattern,
  wildVersionPattern,
  getAppManifest,
} from '../manifest-utils'
import {
  generateFilesHash,
  createBatch,
  createChanges,
  watch,
  createTempPath,
  getVtexIgnore,
  listFiles,
  compressFiles,
  deleteTempFile,
} from '../file-utils'

const workspaceAppsClient = () => new WorkspaceAppsClient({
  authToken: getToken(),
  userAgent: `toolbelt-v-${pkg.version}`,
})

const sandboxesClient = () => new SandboxesClient({
  authToken: getToken(),
  userAgent: `toolbelt-v-${pkg.version}`,
})

const workspaceSandboxesClient = () => new WorkspaceSandboxesClient({
  authToken: getToken(),
  userAgent: `toolbelt-v-${pkg.version}`,
})

export default {
  list: {
    alias: 'ls',
    'optionalArgs': 'query',
    description: 'List your installed VTEX apps',
    handler: () => {
      log.debug('Starting to list apps')
      workspaceAppsClient().listDependencies(
        getAccount(),
        getDevWorkspace(getLogin()),
        'storefront'
      )
      .then(res => {
        if (res.data.length === 0) {
          return log.info('You have no installed apps')
        }
        const table = new Table({
          head: ['Vendor', 'Name', 'Version'],
        })
        res.data.forEach(r => {
          table.push([
            r.vendor,
            r.name,
            r.version,
          ])
        })
        console.log(table.toString())
      })
    },
  },
  watch: {
    description: 'Send the files to the sandbox and watch for changes',
    handler: () => {
      const root = process.cwd()
      let manifest
      let keepAlive
      let sandboxFiles
      let ignore
      let localFiles
      let changes
      let sendChanges
      getAppManifest(root)
      .then(m => { manifest = m })
      .then(() => log.info('Watching app', `${manifest.vendor}.${manifest.name}@${manifest.version}`))
      .then(() => {
        const fn = () => {
          workspaceSandboxesClient().updateAppTtl(
            getAccount(),
            getDevWorkspace(getLogin()),
            manifest.vendor,
            getLogin(),
            manifest.name,
            manifest.version,
            35
          )
          .catch(() => {})
        }
        fn()
        keepAlive = setInterval(fn, 30000)
      })
      .then(() => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        })
        rl.on('SIGINT', () => {
          workspaceSandboxesClient().deactivateApp(
            getAccount(),
            getDevWorkspace(getLogin()),
            manifest.vendor,
            getLogin(),
            manifest.name,
            manifest.version
          )
          .catch(() => {
            log.info('Bye, bye o/')
            clearTimeout(keepAlive)
            process.exit()
          })
        })
      })
      .then(() => {
        sendChanges = changes => {
          sandboxesClient().updateFiles(
            manifest.vendor,
            getLogin(),
            manifest.name,
            manifest.version,
            changes
          )
          .then(() => logChanges(changes))
        }
      })
      .then(() =>
        sandboxesClient().listRootFolders(
          manifest.vendor,
          getLogin(),
          manifest.name,
          manifest.version,
          { list: true, '_limit': 1000 }
        )
      )
      .then(f => { sandboxFiles = f.data })
      .then(() => getVtexIgnore(root))
      .then(i => { ignore = i })
      .then(() => listFiles(root, ignore))
      .then(f => { localFiles = f })
      .then(() => generateFilesHash(root, localFiles))
      .then(f => createBatch(f, sandboxFiles))
      .then(b => createChanges(root, b))
      .then(c => { changes = c })
      .then(() => sendChanges(changes))
      .then(() => watch(root, ignore, sendChanges))
    },
  },
  install: {
    requiredArgs: 'app',
    alias: 'i',
    options: [
      {
        short: 's',
        long: 'simulation',
        description: 'simulate an install',
        type: 'boolean',
      },
    ],
    description: 'Install the specified app',
    handler: (app, options) => {
      log.debug('Starting to install app', app)
      const appRegex = new RegExp(`^${vendorPattern}\.${namePattern}@${wildVersionPattern}$`)
      if (!appRegex.test(app)) {
        return log.error('Invalid app format, please use <vendor>.<name>@<version>')
      }
      const simulation = options.s || options.simulation
      const [name, version] = app.split('@')
      workspaceAppsClient().installApp(
        getAccount(),
        getDevWorkspace(getLogin()),
        name,
        version,
        simulation
      )
      .then(() => log.info(`Installed app ${app} succesfully`))
      .catch(err => {
        if (err.statusCode === 409) {
          return log.error(`App ${app} already installed`)
        }
        throw new Error(err)
      })
    },
  },
  uninstall: {
    requiredArgs: 'app',
    description: 'Uninstall the specified app',
    handler: (app) => {
      log.debug('Starting to uninstall app', app)
      log.info('Uninstall app', app)
    },
  },
  publish: {
    requiredArgs: 'app',
    description: 'Publish this app',
    handler: (app) => {
      log.debug('Starting to publish app', app)
      log.info('Publish app', app)
    },
  },
}
