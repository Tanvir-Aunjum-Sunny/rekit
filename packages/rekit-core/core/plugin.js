'use strict';

// Summary:
//  Load plugins

const fs = require('fs');
const path = require('path');
const shell = require('shelljs');
const _ = require('lodash');
const os = require('os');
const paths = require('./paths');
const config = require('./config');

let plugins = [];
let loaded = false;
let needFilterPlugin = true;

const DEFAULT_PLUGIN_DIR = path.join(os.homedir(), '.rekit/plugins');

const pluginsDirs = [DEFAULT_PLUGIN_DIR];
function addPluginsDir(dir) {
  pluginsDirs.push(dir);
}
function getPluginsDir() {
  return DEFAULT_PLUGIN_DIR;
}

function filterPlugins() {
  const rekitConfig = config.getRekitConfig();
  let appType = rekitConfig.appType;

  // If no appType configured, set it to the first matched plugin except common.
  // Pure folder plugin is always loaded.
  if (!appType) {
    const appPlugin = _.find(plugins, p => p.isAppPlugin && p.appType !== 'common');
    if (appPlugin) appType = appPlugin.appType;
  }

  if (!appType) appType = 'common';
  config.setAppType(appType);

  plugins = plugins.filter(p => {
    return !p.appType || _.castArray(p.appType).includes(appType);
  });

  plugins.forEach(p => console.log('Plugin applied: ', p.name, p.ui ? p.ui.root : ''));

  needFilterPlugin = false;
}
function getPlugins(prop) {
  // if (!loaded) {
  //   loadPlugins();
  // }

  if (needFilterPlugin) {
    filterPlugins();
  }

  return prop ? plugins.filter(_.property(prop)) : plugins;
}

function isPluginValidForProject(plugin) {
  // Detect if folder structure is for the plugin
  if (
    _.isArray(plugin.featureFiles) &&
    !plugin.featureFiles.every(
      f => (f.startsWith('!') ? !fs.existsSync(paths.map(f.replace('!', ''))) : fs.existsSync(paths.map(f)))
    )
  ) {
    return false;
  }
  return true;
}

// Load plugin instance, plugin depends on project config
function loadPlugin(pluginRoot, noUI) {
  try {
    console.log('load plugin: ', pluginRoot);
    const pkgJson = require(paths.join(pluginRoot, 'package.json'));
    const pluginInstance = {};
    // Core part
    const coreIndex = paths.join(pluginRoot, 'core/index.js');
    if (fs.existsSync(coreIndex)) {
      Object.assign(pluginInstance, require(coreIndex));
    }

    // UI part
    if (!noUI && fs.existsSync(path.join(pluginRoot, 'main.js'))) {
      pluginInstance.ui = {
        root: pluginRoot,
      };
    }

    // Plugin meta
    Object.assign(pluginInstance, _.pick(pkgJson, ['appType', 'name', 'isAppPlugin', 'featureFiles']));
    if (!isPluginValidForProject(pluginInstance)) return null;
    return pluginInstance;
  } catch (e) {
    console.warn(`Failed to load plugin: ${pluginRoot}, ${e}\n${e.stack}`);
  }

  return null;
}

function loadPlugins(dir) {
  console.log('load plugins: ', dir);
  // if (loaded) return;
  // const localPluginRoot = paths.getLocalPluginRoot();

  // const prjPkgJson = require(paths.map('package.json'));

  // Find local plugins, all local plugins are loaded
  // let pluginFolders = [];
  // if (fs.existsSync(localPluginRoot)) {
  //   pluginFolders = pluginFolders.concat(
  //     shell
  //       .ls(localPluginRoot)
  //       .filter(d => fs.existsSync(paths.join(localPluginRoot, d)))
  //       .map(d => paths.join(localPluginRoot, d))
  //   );
  // }

  // // Find installed plugins, only those defined in package.rekit.plugins are loaded.
  // if (prjPkgJson.rekit && prjPkgJson.rekit.plugins) {
  //   pluginFolders = pluginFolders.concat(
  //     prjPkgJson.rekit.plugins.map(
  //       p => (path.isAbsolute(p) ? p : require.resolve(/^rekit-plugin-/.test(p) ? p : 'rekit-plugin-' + p))
  //     )
  //   );
  // }

  // const dirs = _.castArray(getPluginsDir());
  // dirs.forEach(dir => {
  fs.readdirSync(dir)
    .map(d => path.join(dir, d))
    .filter(d => fs.statSync(d).isDirectory())
    .forEach(addPluginByPath);
  // });
  // Create plugin instances
  // pluginFolders.forEach(addPluginByPath);
  // loaded = true;
}

// Dynamically add an plugin
function addPlugin(plugin) {
  if (!plugin) {
    console.warn('adding none plugin, ignored: ', plugin);
    return;
  }
  console.log('adding plugin ', plugin.name);
  if (!needFilterPlugin) {
    console.warn('You are adding a plugin after getPlugins is called.');
  }
  needFilterPlugin = true;
  if (!plugin.name) throw new Error('Each plugin should have a name.');
  if (_.find(plugins, { name: plugin.name })) {
    console.warn('You should not add a plugin with same name: ' + plugin.name);
    return;
  }
  plugins.push(plugin);
}

function addPluginByPath(pluginRoot) {
  addPlugin(loadPlugin(pluginRoot));
}

function removePlugin(pluginName) {
  const removed = _.remove(plugins, { name: pluginName });
  if (!removed.length) console.warn('No plugin was removed: ' + pluginName);
}

// Load plugins from a plugin project
function loadDevPlugins(prjRoot) {
  const devPort = config.getRekitConfig(false, prjRoot).devPort;
  const featuresDir = path.join(prjRoot, 'src/features');
  shell
    .ls(featuresDir)
    .map(p => path.join(featuresDir, p))
    .forEach(pluginRoot => {
      const p = loadPlugin(pluginRoot, true);
      console.log('load dev plugin: ', pluginRoot);
      if (!p) return;
      if (fs.existsSync(path.join(pluginRoot, 'entry.js'))) {
        p.ui = {
          root: path.join(pluginRoot, 'public'),
          rootLink: `http://localhost:${devPort}/static/js/${p.name}.bundle.js`,
        };
      }
      addPlugin(p);
    });
}

module.exports = {
  getPlugins,
  loadPlugins,
  addPlugin,
  addPluginByPath,
  removePlugin,
  getPluginsDir,
  loadDevPlugins,
  addPluginsDir,
};
