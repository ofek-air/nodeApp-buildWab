/** Programmer: Michael Lev mlev.mail@gmail.com 
 * Last edited: 202404-08-19-10 
 * Description: program to create WAB apps from last-version-app
 */
import * as fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { clearInterval } from 'timers'
import AdmZip from 'adm-zip'
import JSZip from 'jszip'
//import asyncUnzip from 'async-unzip';
//const { ZipFile, EntryType } = asyncUnzip;
//import async from 'async'
const __PROGRAM_VERSION = "v24_08_28"
const __CONFIG_FILE = '_buildCfg.json'
const __APPS_LOGOS_FOLDER = "_appsLogos"
let __bldCfg = null
let __stopperStartTime = 0
let __stopperSeconds = 0
let __msgObj = { i: null, length: null, appFoldername: null }
let __logObj = { logLines: null, cfg: null }
let __logFilename = null
let __msgPart1 = null
let __msgPart2 = null
let __msgPrefix = ""
let __interval = null
let __isWorking = false
let __isDeleteOnFail = false
if (process.argv.length < 2 || process.argv.length > 2) {
  console.log('USAGE: node build')
} else {
  await wk();
}
async function wk() {
  let processDir = process.cwd()
  __logFilename = `${getDate().formatted}.json`

  /********** */
  /** read cfg*/
  /********** */
  const __mainCfgItems = [//reference list - app main config items
    "portalUrl",
    "map.portalUrl",
    "appId",
    "map.itemId",
    "map.mapOptions",
    "monitorAppName",
    "titleBrowserTab",
    "titleBrowserTabEng",
    "mapTitle",
    "mapTitleEng",
    "isOfekManager",
    "isPublicApp",
    "defaultLayerTitleForFilterAndStatistics",
    "widgetsToHide",
    "apiKeyHandler",
    "mapLayers",
    "ofekCfgMaps3d",
    "lakeWaterHeight",
    "orbit45",
    "orbit360"
  ]
  const _filepathBuildCfg = path.resolve(processDir, __CONFIG_FILE)
  try {
    __bldCfg = await readJson(_filepathBuildCfg)
  } catch (err) {
    console.error(`Failed to read config file ${_filepathBuildCfg}\n__  ${err}`)
    process.exit(1)
  }

  /********************************** */
  /** check cfg for missing top items */
  /********************************** */
  const _cfgTopItems = [
    "CONFIG_VERSION", "appId",
    "isDeleteTargetAppOnFail", "isCreateAppByZipElseByCopy", "isCopyByNodeElseByChildProcess",
    "newVersionApp", "allAppsFolder", "apps"]
  let ok = true
  let missingItems = []
  for (let cfgTopItem of _cfgTopItems) {
    if (!__bldCfg[cfgTopItem] && __bldCfg[cfgTopItem] !== false) {
      missingItems.push(cfgTopItem)
      ok = false
    }
  }
  if (!ok) {
    console.error(`FAILED: Missing top item${missingItems.length > 1 ? "s" : ""} ` +
      `"${missingItems.join(', ')}" in ${_filepathBuildCfg}`)
    process.exit(1)
  }

  __logObj.logLines = []
  __logObj.cfg = __bldCfg

  /** 1st log line - program version */
  let _newVersionApp = __bldCfg.newVersionApp
  if (_newVersionApp.includes(".zip")) {
    _newVersionApp = _newVersionApp.replaceAll(".zip", "")
  }
  _newVersionApp = path.resolve(_newVersionApp)

  const _allAppsFolder = path.resolve(__bldCfg.allAppsFolder)
  let msg
  msg = `program folder    : -  ${processDir}, prog version: ${__PROGRAM_VERSION}, config version: ${__bldCfg.CONFIG_VERSION}`
  console.log(msg); __logObj.logLines.push(msg)
  if (__PROGRAM_VERSION !== __bldCfg.CONFIG_VERSION) {
    console.error(`FAILED: Build-Program version !=  Build-Config version`)
    process.exit(1)
  }

  /** 2nd log line - program 3 flags */
  msg = `config flags      : -  isDeleteTargetAppOnFail: ${__bldCfg["isDeleteTargetAppOnFail"]}, ` +
    `isCreateAppByZipElseByCopy: ${__bldCfg["isCreateAppByZipElseByCopy"]}, ` +
    `isCopyByNodeElseByChildProcess: ${__bldCfg["isCopyByNodeElseByChildProcess"]}`
  console.log(msg); __logObj.logLines.push(msg)

  /** 3rd log line - new version app */
  msg = `new version app   : -  ${_newVersionApp}`
  console.log(msg); __logObj.logLines.push(msg)

  /** 4th log line - folder where to build all apps */
  msg = `apps build-folder : -  ${_allAppsFolder}`
  console.log(msg); __logObj.logLines.push(msg)

  msg = `log of each program step: ...`
  console.log(msg); __logObj.logLines.push(msg)
  __isDeleteOnFail = __bldCfg.isDeleteTargetAppOnFail

  // set appsFlaggedArr
  let _flagsObj = __bldCfg.flags
  let flagsArr = Object.keys(_flagsObj)
  let appsFlaggedArr = []
  for (let i = 0; i < flagsArr.length; i++) {
    let appName = flagsArr[i]
    let objCurr = _flagsObj[appName]
    if (objCurr) {
      appsFlaggedArr.push(appName)
    }
  }
  
  //set appNameMaxLen, _appsToBuildArr, _isBuildAtLeastOneApp
  let appNameMaxLen = 0;
  let _appsToBuildArr = []
  let _appsObj = __bldCfg.apps
  let appsArr = Object.keys(_appsObj)
  for (let i = 0; i < appsArr.length; i++) {
    let appFoldername = appsArr[i]
    if (appFoldername.length > appNameMaxLen) appNameMaxLen = appFoldername.length
    if (_flagsObj[appFoldername]) {
      _appsToBuildArr.push(appFoldername)
    }
  }
  let _isBuildAtLeastOneApp = _appsToBuildArr.length > 0

  //source folder
  const _fpNewVerApp = path.resolve(_newVersionApp)
  if (true) {/** validate new version app files */
    let filepathIndexDotHtml
    {//** validate new version app exists */
      if (!await exists(_fpNewVerApp)) {
        console.error(`FAILED: New-Version-App "${_fpNewVerApp}" does not exist`)
        process.exit(1)
      }
      let stat = await fs.promises.stat(_fpNewVerApp)
      if (!stat.isDirectory()) {
        console.error(`FAILED: New-Version-App "${_fpNewVerApp}" is not a folder`)
        process.exit(1)
      }
    }
    /******************************* */
    /** test existence of index.html */
    /******************************* */
    {/** validate new version app index.html exists */
      filepathIndexDotHtml = await getFilepath([_fpNewVerApp, "index.html"])
      if (filepathIndexDotHtml === -1) {
        console.error(`FAILED: New-Version-App does not exist: ${_fpNewVerApp}`)
        process.exit(1)
      } if (!filepathIndexDotHtml) {
        console.error(`FAILED: New-Version missing file: "${path.resolve(_fpNewVerApp, 'index.html')}"`)
        process.exit(1)
      }
    }
    /************************************************************************ */
    /** validate new version app index.html ofekAppVersion exists       */
    /************************************************************************ */
    {/** validate new version app index.html ofekAppVersion exists */
      let data = await fs.promises.readFile(filepathIndexDotHtml, 'utf8')
      //let prefix = "<title>"
      //let suffix = "</title>"
      //if (data.indexOf(prefix) < 0 || data.indexOf(suffix) < 0) {
      //  console.error(`FAILED: New-Version file "index.html" is missing "<title>..."</title>" element`)
      //  process.exit(1)
      //}
      let prefix = `const ofekAppVersion = "`
      if (data.indexOf(prefix) < 0) {
        console.error(`FAILED: New-Version file "index.html" ` +
          `has no definition of "ofekAppVersion" javascript variable`)
        process.exit(1)
      }
      if (data.indexOf(`${prefix}${__PROGRAM_VERSION}"`) < 0) {
        console.error(`FAILED: Version of New-Version-App != Build-Program version`)
        process.exit(1)
      }
    }
    /***************************************** */
    /** test existence of app main config file */
    /***************************************** */
    let fpNewVerAppMainCfg
    {/** validate new version app main cfg exists */
      fpNewVerAppMainCfg = await getFilepath([_fpNewVerApp, 'config.json'])
      if (!fpNewVerAppMainCfg) {
        console.error(`FAILED: New-Version missing file: "${path.resolve(_fpNewVerApp, 'config.json')}"`)
        process.exit(1)
      }
    }
    /*************************************** */
    /** validate new version app main config */
    /*************************************** */
    {//validate new version app main config contents
      let newVerAppMainCfgObj = null
      try {
        newVerAppMainCfgObj = await readJson(fpNewVerAppMainCfg)
      } catch (err) {
        console.error(`FAILED: New Version - Failed to read main cfg file ${fpNewVerAppMainCfg}\n__  ${err}`)
        process.exit(1)
      }
      let missingItems = evaluateMissingItems(__mainCfgItems, newVerAppMainCfgObj)
      if (missingItems.length > 0) {
        console.error(`FAILED: New Version app main config file ${fpNewVerAppMainCfg} - ` +
          `Missing cfg item${missingItems.length > 1 ? "s" : ""} ` +
          `"${missingItems.join(', ').replaceAll('?', '')}"`)
        process.exit(1)
      }
    }//validate new version app main config
  }// /** validate new version app files */
  /**************************************************************************** */
  /** if is creating by unzip AND at-least-once mode === build, then create zip */
  /**************************************************************************** */
  if (__bldCfg.isCreateAppByZipElseByCopy) {//create zip
    //let data = await fs.promises.readFile(_configFilepath, 'utf8')
    //if (data.indexOf("generate") > 0) {
    if (_isBuildAtLeastOneApp) {
      stopperClear()
      __isWorking = true
      let sourceDir = _newVersionApp
      let outputZipFile = _newVersionApp + ".zip"
      __msgPrefix = `Creating ${outputZipFile} --> `
      stopperInit()
      stopperIntervalFunction()
      let status = await zipFoldersTree(sourceDir, outputZipFile)
      console.log(__msgPart2); __logObj.logLines.push((__msgPart1 + __msgPart2))
      stopperClear()
      if (!status) {
        process.exit(1)
      }
    }
  }//create zip
  /************ */
  /** scan apps */
  /************ */
  for (let i = 0; i < appsArr.length; i++) {//scan apps (in buildCfg)
    stopperClear()
    let appFoldername = appsArr[i]
    let appPathTarget = path.resolve(_allAppsFolder, appFoldername)
    __msgObj = { i: i, length: appsArr.length, appFoldername: appFoldername }
    let spaces = " ".repeat(appNameMaxLen - appFoldername.length);
    __msgPrefix = `app[${String(__msgObj.i + 1).padStart(2, " ")}/` +
      `${String(__msgObj.length).padStart(2, " ")}]: ` +
      `${__msgObj.appFoldername}${spaces} --> `
    let bldCfgAppObjCurr = _appsObj[appFoldername]
    let toBuild = _appsToBuildArr.includes(appFoldername)
    let mode = toBuild ? (appPathTarget === _newVersionApp ? "modify" : "generate") : "skip"
    let sp1 = ""
    switch (mode) {
      case "skip":
        sp1 = "    "
        break;
      case "generate":
        sp1 = ""
        break;
      case "modify":
        sp1 = "  "
        break;
    }
    stopperInit();
    __msgPrefix = `app[${String(__msgObj.i + 1).padStart(2, " ")}/` +
      `${String(__msgObj.length).padStart(2, " ")}]: ` +
      `${__msgObj.appFoldername}${spaces} -- ${mode}${sp1} ... `
    __isWorking = true
    stopperIntervalFunction()
    /******************************************** */
    /** in buildCfg - test existence of app.items */
    /******************************************** */
    //let items = "items"
    //if (!bldCfgAppObjCurr[items]) {//app.items exists?
    //  stopperClear()
    //  __msgPart2 = (`FAILED: Missing item "${items}" in "${_filepathBuildCfg}" for App "${appFoldername}"`)
    //  console.log(__msgPart2); __logObj.logLines.push(__msgPart1 + __msgPart2)
    //  continue
    //}
    if (mode !== "skip") {// mode = generate or modify
      let filepathTargetAppConfig = null
      /************************************************************************ */
      /** in buildCfg - app.itemsNotInMainCfg contains all its sub-items? */
      /************************************************************************ */
      let itemsNotInMainCfg = [
        "whatsapp_sharing_title", "oblique_app_url", "searchSource2IsAdded", "searchSource2"
      ]
      {//in buildCfg - app.itemsNotInMainCfg contains all its sub-items?
        let ok = true
        let missingItems = []
        for (let cfgItem of itemsNotInMainCfg) {
          switch (cfgItem) {
            case "oblique_app_url"://we allow null or ""
            case "searchSource2IsAdded"://we allow false
              if (typeof (bldCfgAppObjCurr.itemsNotInMainCfg[cfgItem]) === "undefined") {
                missingItems.push(cfgItem)
                ok = false
              }
              break;
            case "searchSource2":
              if (bldCfgAppObjCurr.itemsNotInMainCfg.searchSource2IsAdded) {
                if (!bldCfgAppObjCurr.itemsNotInMainCfg[cfgItem]) {
                  missingItems.push(cfgItem)
                  ok = false
                }
              }
              break;
            default:
              if (!bldCfgAppObjCurr.itemsNotInMainCfg[cfgItem]) {
                missingItems.push(cfgItem)
                ok = false
              }
              break;
          }
        }//for
        if (!ok) {
          stopperClear()
          __msgPart2 = (`FAILED: Missing item${missingItems.length > 1 ? "s" : ""} "${missingItems.join(', ')}" ` +
            `in "${_filepathBuildCfg}" in "itemsNotInMainCfg" object for App "${appFoldername}"`)
          console.log(__msgPart2); __logObj.logLines.push(__msgPart1 + __msgPart2)
          continue
        }
      }
      /********************************************************************* */
      /** in buildCfg - app.itemsInMainCfg contains all its sub-items? */
      /********************************************************************* */
      {//in buildCfg - app.itemsInMainCfg contains all its sub-items?
        let missingItems = evaluateMissingItems(__mainCfgItems, bldCfgAppObjCurr.itemsInMainCfg)
        if (missingItems.length > 0) {
          stopperClear()
          __msgPart2 = (`FAILED: Missing (or empty) item${missingItems.length > 1 ? "s" : ""} "${missingItems.join(', ')}" ` +
            `in "${_filepathBuildCfg}" in "itemsInMainCfg" object for App "${appFoldername}"`)
          console.log(__msgPart2); __logObj.logLines.push(__msgPart1 + __msgPart2)
          continue
        }
      }

      /********************************************************************************************** */
      /** do if mode = generate - _appPathNewVersion is either zip or folder. we can build target app */
      /********************************************************************************************** */
      if (mode === "generate") {//_appPathNewVersion is either zip or folder. we can build target app
        if (await exists(appPathTarget)) {
          await deleteDir(appPathTarget)
        }
        if (__bldCfg.isCreateAppByZipElseByCopy) {//1 - if create app by zip - unzip new version app to target app
          let zipFilePath = _fpNewVerApp//it is a zip
          try {
            if (zipFilePath.indexOf(".zip") === -1) {
              zipFilePath += ".zip"
            }
            let ret = await unzipFile(zipFilePath, appPathTarget)
            if (!ret) {
              stopperClear()
              console.log(__msgPart2); __logObj.logLines.push(__msgPart1 + __msgPart2)
              await deleteDir(appPathTarget)
              continue
            }
          } catch (err) {
            const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
            __msgPart2 = `FAILED: Failed to unZip "${zipFilePath}" to "${appPathTarget}": ${msgErr}`
            await stopperClearAsync(appPathTarget)
            continue
          }
        }//1 - if create app by zip - unzip new version app to target app
        else {//2 - if create app by copy - _appPathNewVersion is a folder. copy it to target app
          try {
            let ret = await copyDir(_fpNewVerApp, appPathTarget, __bldCfg.isCopyByNodeElseByChildProcess)
            if (!ret) {
              await stopperClearAsync(appPathTarget)
              continue
            }
          } catch (err) {
            const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
            __msgPart2 = (`FAILED: Failed to copy "${_fpNewVerApp}" to "${appPathTarget}": ${msgErr}`)
            await stopperClearAsync(appPathTarget)
            continue
          }
        }//2 - if create app by copy - _appPathNewVersion is a folder. copy it to target app
      }//mode = generate

      /************************************** */
      /** do if mode = "ganerate" or "modify" */
      /************************************** */

      {//modify target app - 1 - index.html - whatsapp_sharing_title
        let filepathIndexDotHtml = await getFilepath([appPathTarget, "index.html"])
        try {
          if (filepathIndexDotHtml === -1) {
            __msgPart2 = (`FAILED: Target App does not exist: ${appPathTarget}`)
            await stopperClearAsync(appPathTarget)
            continue
          }
          if (!filepathIndexDotHtml) {
            __msgPart2 = (`FAILED: file does not exist: "${path.resolve(appPathTarget, 'index.html')}"`)
            await stopperClearAsync(appPathTarget)
            continue
          }
          let data = await fs.promises.readFile(filepathIndexDotHtml, 'utf8')
          let prefix, suffix, index1, index2
          //
          /************** */
          /* handle title */
          /************** */
          //prefix = "<title>"
          //suffix = "</title>"
          //index1 = data.indexOf(prefix) + prefix.length
          //index2 = data.indexOf(suffix)
          //let currChromeTitle = data.substring(index1, index2)
          //data = data.replace(prefix + currChromeTitle + suffix,
          //  prefix + bldCfgAppObjCurr.itemsNotInMainCfg["title"] + suffix)
          //
          /******************************* */
          /* handle whatsapp_sharing_title */
          /******************************* */
          //const regex = /(?<=\bconst\s+\bofekCfgMonitorFolder\b\s*=\s*(?:"[^"]*",\s*)*")[^"]*(?=")/g;
          prefix = `<meta property="og:title" content="`
          suffix = `">`
          if (data.indexOf(prefix) < 0) {//handle whatsapp_sharing_title
            __msgPart2 = (`FAILED: meta property="og:title" is not defined in "${filepathIndexDotHtml}" file`)
            await stopperClearAsync(appPathTarget)
            continue
          }
          index1 = data.indexOf(prefix) + prefix.length
          index2 = index1 + data.substring(index1).indexOf(suffix)
          let whatsapp_sharing_title = data.substring(index1, index2)
          data = data.replace(prefix + whatsapp_sharing_title + suffix,
            prefix + bldCfgAppObjCurr.itemsNotInMainCfg["whatsapp_sharing_title"] + suffix)
          await fs.promises.writeFile(filepathIndexDotHtml, data, 'utf8');
        } catch (err) {
          const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
          __msgPart2 = (`FAILED: error when modifying ${filepathIndexDotHtml}: ${msgErr}`)
          await stopperClearAsync(appPathTarget)
          continue
        }
      }//modify target app - 1 - index.html - whatsapp_sharing_title
      {//modify target app - 2 - copy customer logo
        const logoImageSourcePath = path.resolve(processDir, __APPS_LOGOS_FOLDER, appFoldername + ".png")
        if (!await exists(logoImageSourcePath)) {
          __msgPart2 = (`FAILED: Logo image source path to copy from, does not exist: ${logoImageSourcePath}`)
          await stopperClearAsync(appPathTarget)
          continue
        }
        const logoImageDestinationPath = await getFilepath([appPathTarget, "images", "app-logo.png"])
        if (!logoImageDestinationPath) {
          __msgPart2 = (`FAILED: Logo image destination path does not exist: ` +
            `${path.join(appPathTarget, _CUSTOMER_LOGO_FILENAME_IN_TARGET_APP)}`)//TODO
          await stopperClearAsync(appPathTarget)
          continue
        }
        if (logoImageDestinationPath) {
          try {
            await fs.promises.copyFile(logoImageSourcePath, logoImageDestinationPath)
          } catch (err) {
            const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
            __msgPart2 = (`FAILED: Failed to modify App logo image destination path ${logoImageDestinationPath}: ${msgErr}`)
            await stopperClearAsync(appPathTarget)
            continue
          }
        }
      }//modify target app - 2 - copy customer logo
      {/** modify Search widget config */
        if (bldCfgAppObjCurr.itemsNotInMainCfg.searchSource2IsAdded) {//for Ashkelon
          let filepathSearchCfg = await getFilepath([appPathTarget, "configs/Search", "config_widgets_Search_Widget.json"])
          if (!filepathSearchCfg) {//tst
            __msgPart2 = (`FAILED: oblique widget config file does not exist: ${filepathSearchCfg}`)
            await stopperClearAsync(appPathTarget)
            continue
          }//tst
          let searchCfgObj = null
          try {
            searchCfgObj = await readJson(filepathSearchCfg)
          } catch (err) {
            const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
            __msgPart2 = (`FAILED: Failed to read "Search" widget config file ${filepathSearchCfg}: ${msgErr}`)
            await stopperClearAsync(appPathTarget)
            continue
          }
          for (let i = searchCfgObj.sources.length - 1; i >= 0; i--) {
            if (searchCfgObj.sources[i].url !== "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer") {
              searchCfgObj.sources.splice(i, 1)
            }
          }
          searchCfgObj.sources.push(bldCfgAppObjCurr.itemsNotInMainCfg.searchSource2)
          {//write Search widget config
            let formatted = JSON.stringify(searchCfgObj, null, 2);
            try {
              await fs.promises.writeFile(filepathSearchCfg, formatted)
            } catch (err) {
              const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
              __msgPart2 = (`FAILED: Failed to write "Search" widget config file "${filepathSearchCfg}": ${msgErr}`)
              await stopperClearAsync(appPathTarget)
              continue
            }
          }//write Search widget config
        }
      }/** modify Search widget config */
      {//modify target app - 3 - modify oblique widget config
        let filepathOrbitWidgetConfig = await getFilepath([appPathTarget, "widgets/screen/coordinate/Orbit", "config.json"])
        if (!filepathOrbitWidgetConfig) {//tst
          __msgPart2 = (`FAILED: oblique widget config file does not exist: ${filepathOrbitWidgetConfig}`)
          await stopperClearAsync(appPathTarget)
          continue
        }//tst
        let orbitWidgetCfgObj = null
        try {
          orbitWidgetCfgObj = await readJson(filepathOrbitWidgetConfig)
        } catch (err) {
          const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
          __msgPart2 = (`FAILED: Failed to read "Orbit" widget config file ${filepathOrbitWidgetConfig}: ${msgErr}`)
          await stopperClearAsync(appPathTarget)
          continue
        }
        orbitWidgetCfgObj.urlProject = bldCfgAppObjCurr.itemsNotInMainCfg.oblique_app_url
        orbitWidgetCfgObj.isNewTabProj = orbitWidgetCfgObj.urlProject ? true : false;
        {//write oblique widget config
          let formatted = JSON.stringify(orbitWidgetCfgObj, null, 2);
          try {
            await fs.promises.writeFile(filepathOrbitWidgetConfig, formatted)
          } catch (err) {
            const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
            __msgPart2 = (`FAILED: Failed to write "Orbit" widget config file "${filepathOrbitWidgetConfig}": ${msgErr}`)
            await stopperClearAsync(appPathTarget)
            continue
          }
        }//write oblique widget config
        {/** handle Orbit widget icons */
          if (orbitWidgetCfgObj.isNewTabProj && orbitWidgetCfgObj.urlProject) {
            let publisher
            {/** publisher = idan /orbit*/
              let newTabUrl = orbitWidgetCfgObj.urlProject.toLowerCase()
              let isIdanElseOrbit = newTabUrl.includes("oblivisionjs") ? true : newTabUrl.includes("publication") ? false : null
              if (isIdanElseOrbit === null) {
                __msgPart2 = `FAILED: widget "Orbit" config item "urlProject" value ` +
                  `"${orbitWidgetCfgObj.urlProject}" is illegal`
                await stopperClearAsync(appPathTarget)
                continue
              }
              publisher = isIdanElseOrbit ? "idan" : "orbit"
            }
            {/** handle widget "images" folder */
              let imagePathSrc = await getFilepath([appPathTarget, `widgets/screen/coordinate/Orbit/images/${publisher}`, "icon.png"])
              if (!imagePathSrc) {
                __msgPart2 = (`FAILED: widget "Orbit" icon does not exist: ` +
                  `${path.join(appPathTarget, `widgets/screen/coordinate/Orbit/images/${publisher}`, "icon.png")}`)
                await stopperClearAsync(appPathTarget)
                continue
              }
              let imagePathDst = path.resolve(appPathTarget, "widgets/screen/coordinate/Orbit/images", "icon.png")
              try {
                await fs.promises.copyFile(imagePathSrc, imagePathDst)
              } catch (err) {
                const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
                __msgPart2 = (`FAILED: Failed to overwrite Widget "Orbit" icon: ${msgErr}`)
                await stopperClearAsync(appPathTarget)
                continue
              }
            }
            {/** handle widget css/images folder */
              try {
                let sourceDir = path.resolve(appPathTarget, `widgets/screen/coordinate/Orbit/css/images/${publisher}`)
                let destinationDir = path.resolve(appPathTarget, `widgets/screen/coordinate/Orbit/css/images`)
                await copyDir(sourceDir, destinationDir, true)
              } catch (err) {
                const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
                __msgPart2 = (`FAILED: Failed to overwrite Widget "Orbit" css/images icons: ${msgErr}`)
                await stopperClearAsync(appPathTarget)
                continue
              }
            }
          }
        }
      }//modify target app - 3 - modify Orbit widget config

      {//modify target app - 4 - modify main config
        {//validate tgt app config file exists
          filepathTargetAppConfig = await getFilepath([appPathTarget, "config.json"])
          if (!filepathTargetAppConfig) {//tst
            __msgPart2 = (`FAILED: main config file does not exist: ${filepathTargetAppConfig}`)
            await stopperClearAsync(appPathTarget)
            continue
          }//tst
        }
        {
          try {
            let tgtAppMainCfgObj = null
            try {
              tgtAppMainCfgObj = await readJson(filepathTargetAppConfig)
            } catch (err) {
              const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
              __msgPart2 = (`FAILED: Failed to read main cfg file ${filepathTargetAppConfig}: ${msgErr}`)
              await stopperClearAsync(appPathTarget)
              continue
            }
            let missingItems = evaluateMissingItems(__mainCfgItems, tgtAppMainCfgObj)
            if (missingItems.length > 0) {
              __msgPart2 = (`FAILED: Missing cfg item${missingItems.length > 1 ? "s" : ""} ` +
                `"${missingItems.join(', ').replaceAll('?', '')}" ` +
                `in wab App main cfg file ${filepathTargetAppConfig}`)
              await stopperClearAsync(appPathTarget)
              continue
            }
            if (!bldCfgAppObjCurr.itemsNotInMainCfg.oblique_app_url) {
              tgtAppMainCfgObj.widgetsToHide.Orbit = true
            }
            let items = Object.keys(bldCfgAppObjCurr.itemsInMainCfg)
            for (let i = 0; i < items.length; i++) {
              let item = items[i]
              let modifiedItem = bldCfgAppObjCurr.itemsInMainCfg[item]
              let arr = item.split(".")
              let length = arr.length
              switch (length) {
                case 0:
                  break;
                case 1:
                  tgtAppMainCfgObj[item] = modifiedItem
                  break;
                case 2:
                  tgtAppMainCfgObj[arr[0]][arr[1]] = modifiedItem
                  break;
                case 3:
                  tgtAppMainCfgObj[arr[0]][arr[1]][arr[2]] = modifiedItem
                  break;
                case 4:
                  tgtAppMainCfgObj[arr[0]][arr[1]][arr[2]][arr[3]] = modifiedItem
                  break;
                case 5:
                  tgtAppMainCfgObj[arr[0]][arr[1]][arr[2]][arr[3]][arr[4]] = modifiedItem
                  break;
                default:
                  break;
              }//switch
            }//for
            {//write target app main config
              let formatted = JSON.stringify(tgtAppMainCfgObj, null, 2);
              try {
                await fs.promises.writeFile(filepathTargetAppConfig, formatted)
              } catch (err) {
                const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
                __msgPart2 = (`FAILED: Failed to write main config file "${filepathTargetAppConfig}": ${msgErr}`)
                await stopperClearAsync(appPathTarget)
                continue
              }
            }//write target app main config
          } catch (err) {
            const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
            __msgPart2 = (`FAILED: Failed to modify main config file "${filepathTargetAppConfig}": ${msgErr}`)
            await stopperClearAsync(appPathTarget)
            continue
          }
        }
      }//modify target app - 4 - modify main config
    }// mode = generate or modify
    stopperClear()
    __msgPart2 = (`${mode === "generate" ? "Generated" : mode === "modify" ? "Modified (new version)" : "Skipped"}`)
    console.log(__msgPart2); __logObj.logLines.push(__msgPart1 + __msgPart2)
  }//for
  stopperClear()
  writeLog()
}
async function deleteDir(appPathTarget) {
  if (__isDeleteOnFail) {
    await fs.promises.rm(appPathTarget, { recursive: true })
  }
}
async function writeLog() {
  let processDir = process.cwd()
  const logDirpath = path.resolve(processDir, "_log")
  try {
    await fs.promises.mkdir(logDirpath, { recursive: true })
  } catch (err) {
    const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
    console.error(`*** Finished. ***. Failed to create log folder "${logDirpath}": ${msgErr}`)
    //process.exit(1)
  }
  const logFilepath = path.resolve(logDirpath, __logFilename)
  try {
    let logFormatted = JSON.stringify(__logObj, null, 2);
    fs.writeFile(logFilepath,
      logFormatted,
      function (err) {
        if (err) {
          console.error(
            ` *** Finished. *** Error in writing log-file: ${logFilepath}\n` +
            ` - error message = ${err.message}`);
        } else {
          console.log(`*** Finished. *** Saved log-file: ${logFilepath}`);
        }
      });
  } catch (err) {
    const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
    console.error(`*** Finished. ***. Failed to write log file "${logFilepath}": ${msgErr}`);
  }
}
async function readJson(jsonFilepath) {
  const fileTxt = await fs.promises.readFile(jsonFilepath, 'utf8');
  //console.log(`${jsonFilepath} as txt:\n${fileTxt}`);
  //console.log(`****`)
  const cfgObj = JSON.parse(fileTxt);
  //console.log(`${jsonFilepath} as obj:`);
  //console.log(cfgObj)
  //console.log(`****`)
  return cfgObj
}
async function readJsonTry(jsonFilepath) {
  const fileTxt = readTextFile(jsonFilepath);
  //console.log(`${jsonFilepath} as txt:\n${fileTxt}`);
  //console.log(`****`)
  const cfgObj = JSON.parse(fileTxt);
  //console.log(`${jsonFilepath} as obj:`);
  //console.log(cfgObj)
  //console.log(`****`)
  return cfgObj
}
function readTextFile(filename) {
  let body = "";
  const buffer = fs.readFileSync(filename);
  //['ascii', 'utf8', 'utf16le', 'ucs2', 'latin1', 'binary']
  const ch1 = buffer[0];
  const ch2 = buffer[1];
  if (ch1 == 0xff && ch2 == 0xfe) {
    body = buffer.toString('utf16le');
  }
  else if (ch1 == 0xfe && ch2 == 0xff) {
    body = buffer.toString('ucs2');
  }
  else {
    const ch3 = buffer[2];
    if (ch1 == 0xef && ch2 == 0xbb && ch3 == 0xbf) {
      body = buffer.toString('utf8');
    }
    else {
      body = buffer.toString('ascii');
    }
  }
  return body;
}
async function exists(filepath) {
  //return fs.existsSync(filepath)
  try {
    await fs.promises.access(filepath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false; // ENOENT error code indicates file does not exist
    } else {
      throw err; // Re-throw other errors
    }
  }
}
function stopperInit() {
  __stopperStartTime = Date.now()
  __stopperSeconds = 0
}
function stopperIntervalFunction() {
  clearInterval(__interval);
  if (__isWorking) {
    __interval = setInterval(stopperIntervalFunction, 1000);
    stopperTick()
  }
}
function stopperTick() {
  if (__isWorking) {
    __stopperSeconds = Math.round((Date.now() - __stopperStartTime) / 1000.0); //to get by seconds
    let sp = " ".repeat(__stopperSeconds < 10 ? 2 : __stopperSeconds < 100 ? 1 : 0)
    __msgPart1 = `${__msgPrefix}[seconds: ${sp}${__stopperSeconds}] --> `
    process.stdout.write(`\r${__msgPart1}`)
  }
}
function stopperClear() {
  __isWorking = false
  clearInterval(__interval)
}
async function stopperClearAsync(appPathTarget) {
  stopperClear()
  console.log(__msgPart2)
  __logObj.logLines.push(__msgPart1 + __msgPart2)
  await deleteDir(appPathTarget)
}
function getDate() {
  var date = {};
  date.date = new Date();
  date.ms = date.date.getTime();

  let d = date.date, year = d.getFullYear(),
    month = '' + (d.getMonth() + 1), day = '' + d.getDate(),
    hours = '' + d.getHours(), minutes = '' + d.getMinutes(),
    seconds = '' + d.getSeconds(), ms = '' + d.getMilliseconds();

  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;
  if (hours.length < 2) hours = '0' + hours;
  if (minutes.length < 2) minutes = '0' + minutes;
  if (seconds.length < 2) seconds = '0' + seconds;
  if (ms.length < 2) ms = '0' + ms;
  if (ms.length < 3) ms = '0' + ms;
  //date.formatted = `${year}${month}-${day}--${hours}:${minutes}--${seconds}:${ms}`;
  date.formatted = `${year}${month}-${day}--${hours}-${minutes}`;
  return date;
}
async function getFilepath([...paths]) {//collect items to array "paths"
  try {
    if (paths.length === 0) {
      return -1
    }
    if (!await exists(paths[0])) {
      return -1
    }
    let filepath = null;
    filepath = path.resolve(...paths)//spread the "paths" array
    const fileStatus = await fs.promises.stat(filepath)
    if (fileStatus.isFile()) {
      //console.log(`** filepath found: ${filepath}`)
      return filepath
    }
    return null
  } catch (error) {
    return null
  }
}
async function copyDir(sourceDir, destinationDir, isCopyByNode) {
  let ret = true
  if (isCopyByNode) {
    try {
      await copyDirByNode(sourceDir, destinationDir)
    } catch (err) {
      ret = false
      const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
      __msgPart2 = (`FAILED: Failed to duplicate "${sourceDir}" to "${destinationDir}": ${msgErr}`)
    }
  }
  else {//else - copy by child process
    let code = await copyDirByChildProcess(sourceDir, destinationDir)
    if (code !== 0) {
      ret = false
      __msgPart2 = (`FAILED: Failed to duplicate "${sourceDir}" to "${destinationDir}": ` +
        `copy_process_error_exit_code = ${code}`)
    }
  }
  try {
    if (ret) {
      ret = await scanAndCopyDates(sourceDir, destinationDir, false)
    }
  } catch (err) {
    ret = false
    const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
    __msgPart2 = (`FAILED: Failed to copy dir dates from "${sourceDir}" to "${destinationDir}": ${msgErr}`)
  } finally {
    return ret
  }
}
async function copyDirByNode(sourceDir, destinationDir) {
  //await fs.ensureDir(destination); // Create destination directory (and parents if needed)
  await fs.promises.cp(sourceDir, destinationDir, { recursive: true });
}
async function copyDirByChildProcess(sourceDir, destinationDir) {
  let ret
  try {
    const cp = spawn('cp', ['-r', sourceDir, destinationDir]); // Use 'cp -r' for recursive copy
    cp.stdout.on('data', (data) => {
      console.log(`Copy progress: ${data.toString()}`);
    });
    cp.stderr.on('data', (err) => {
      console.error(`Copy error: ${err.stack.toString()}`);
    });
    await new Promise((resolve, reject) => {
      cp.on('close', (code) => {
        if (code === 0) {
          ret = 0
          resolve();
        } else {
          ret = code
          reject(new Error(`Copy failed with exit code ${code}`));
        }
      });
    });

    //console.log(`${destinationDir} Created.`);
  } catch (error) {
    console.error(`${destinationDir} Creation error:`, error);
  } finally {
    return ret
  }
}
async function unzipFileByAdmZip(zippedPath, targetPath) {
  // Function to unzip asynchronously
  let ret = false
  try {
    // Read the zip file content
    const zip = new AdmZip(zippedPath);
    // Iterate through entries in the zip
    for (const entry of zip.getEntries()) {
      const fullPath = `${targetPath}/${entry.entryName}`; // Construct full path
      // Check if it's a directory
      if (entry.isDirectory) {
        // Create directory if it doesn't exist
        await fs.promises.mkdir(fullPath, { recursive: true });
        //console.log(`Created directory: ${fullPath}`);
      } else {
        // Extract file content
        const data = entry.getData().toString('utf8'); // Adjust encoding as needed
        // Create parent directories if they don't exist (recursive)
        const dirPath = path.dirname(fullPath);
        await fs.promises.mkdir(dirPath, { recursive: true });
        // Write the extracted data to the target file
        await fs.promises.writeFile(fullPath, data);
        //console.log(`Extracted file: ${fullPath}`);
      }
    }
    ret = true
    //console.log('Extraction completed successfully!');
  } catch (err) {
    ret = false
    const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
    __msgPart2 = (`${__msgPrefix}FAILED: Error during unzip: ${msgErr}`)
  } finally {
    return ret
  }
}
async function zipFoldersTree(sourceDir, outputZipFile) {
  let ret = false
  try {
    // Create a new zip instance
    const zip = new JSZip();
    // Function to recursively zip files and directories
    async function zipDirectory(dirPath) {
      const files = await fs.promises.readdir(dirPath);
      for (const file of files) {
        //const filePath = `${dirPath}/${file}`;
        const filePath = path.join(dirPath, file);
        const stats = await fs.promises.stat(filePath);
        if (stats.isDirectory()) {
          // Create a folder in the zip archive (optional)
          zip.folder(filePath.replace(sourceDir, ""))
          //let folderEntry = zip.folder(filePath.replace(sourceDir, ""));
          // Set folder modification time (if supported)
          ////if (folderEntry.options && folderEntry.options.mtime !== undefined) {
          ////  folderEntry.options.mtime = stats.mtimeMs;
          ////}
          //// Set folder creation time (if supported)
          ////if (folderEntry.options && folderEntry.options.ctime !== undefined) {
          ////  folderEntry.options.ctime = stats.birthtimeMs;
          ////}
          // next line works only for first sub-dir
          //folderEntry.files[`${Object.keys(folderEntry.files)[0]}`].date = new Date(stats.mtime.getTime())
          // Recursively zip subdirectories
          await zipDirectory(filePath)
        } else {
          // Read file content and add it to the zip archive
          const content = await fs.promises.readFile(filePath);
          //const modificationTime = stats.mtimeMs;
          // Create a file entry with modification time
          zip.file(filePath.replace(sourceDir, ""), content,
            {
              date: new Date(stats.mtime.getTime())//new Date(stats.mtimeMs)
            })
        }
      }
    }
    // Start zipping from the source directory
    await zipDirectory(sourceDir);
    // Generate the zip content as a Node.js buffer
    const content = await zip.generateAsync({ type: 'nodebuffer' });
    // Write the zip content to the output file
    await fs.promises.writeFile(outputZipFile, content);
    //console.log(`Folder tree zipped to ${outputZipFile}`);
    __msgPart2 = (`Zip created`)
    ret = true
  } catch (err) {
    ret = false
    const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
    __msgPart2 = (`FAILED: ${msgErr}`)
  } finally {
    return ret
  }
}
async function unzipFile(sourceFile, destinationDir) {
  let ret = false
  const newVersionAppDir = sourceFile.replaceAll(".zip", "")
  try {
    // Read the zip file content
    const zipContent = await fs.promises.readFile(sourceFile)
    // Create a JSZip instance from the content
    const zip = await JSZip.loadAsync(zipContent);
    // Function to recursively extract files and folders
    async function extractEntry(entry) {
      const entryPath = entry.name;
      const filePath = path.join(destinationDir, entryPath)
      // Check if it's a directory
      if (entry.dir) {
        // Create the directory in the destination path
        await fs.promises.mkdir(filePath, { recursive: true })
        // 2. Update modification time
        //await fs.promises.utimes(filePath, entry.date, entry.date)
      } else {
        // Extract the file content
        const content = await entry.async('nodebuffer')
        // Create the file in the destination path
        await fs.promises.writeFile(filePath, content)
        // 2. Update modification time
        await fs.promises.utimes(filePath, entry.date, entry.date)
      }
    }
    // Iterate through each entry in the zip file
    for (const entryName in zip.files) {
      const entry = zip.files[entryName];
      await extractEntry(entry);
    }
    ret = true
    //console.log(`Zip file extracted to ${destinationDir}`)
    try {
      ret = await scanAndCopyDates(newVersionAppDir, destinationDir, true)
    } catch (err) {
      ret = false
      //console.error("error: ", err)
      const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
      __msgPart2 = (`FAILED: Failed to copy dir dates from "${sourceFile}" to "${destinationDir}": ${msgErr}`)
    }
  } catch (err) {
    ret = false
    //console.error("error: ", err)
    const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
    __msgPart2 = (`${__msgPrefix}FAILED: Error during unzip: ${msgErr}`)
  } finally {
    return ret
  }
}
async function scanAndCopyDates(sourcePath, targetPath, isOperateOnDirsOnly) {
  let ret = true
  ret = await scanAndCopyDatesKernel(sourcePath, targetPath)
  return ret
  async function scanAndCopyDatesKernel(sourcePath, targetPath) {
    try {
      if (ret) {
        const [sourceEntries, targetEntries] = await Promise.all([
          fs.promises.readdir(sourcePath, { withFileTypes: true }),
          fs.promises.readdir(targetPath, { withFileTypes: true }),
        ]);
        // Ensure both directories have the same number of entries (identical structure)
        if (sourceEntries.length !== targetEntries.length) {
          throw new Error('Directory trees differ in number of entries');
        }
        const promises = sourceEntries.map(async (sourceDirEntry, index) => {
          const sourceItemPath = path.join(sourcePath, sourceDirEntry.name);
          const targetItemPath = path.join(targetPath, targetEntries[index].name);

          if (sourceDirEntry.isDirectory() || !isOperateOnDirsOnly) {
            // Get source directory modification time
            const stats = await fs.promises.stat(sourceItemPath);
            const modifiedTime = new Date(stats.mtime.getTime());
            //modifiedTime.setFullYear(1980); // Set year to a fixed value (optional)

            // Update target directory modification time
            await fs.promises.utimes(targetItemPath, modifiedTime, modifiedTime);
          }
          if (sourceDirEntry.isDirectory()) {
            // Recursively scan subdirectories
            //await fs.promises.mkdir(targetItemPath, { recursive: true });
            return await scanAndCopyDatesKernel(sourceItemPath, targetItemPath);
          }
        });
        await Promise.all(promises);
        ret = true
        __msgPart2 = (`Succeeded`)
      }
    } catch (err) {
      ret = false
      const msgErr = `${err.stack.toString().replaceAll("\n", "")}`
      __msgPart2 = (`FAILED: ${msgErr}`)
    } finally {
      return ret
    }
  }//kernel
}
function evaluateMissingItems(mainCfgItems, currMainCfgObj) {
  let missingItems = []
  for (let cfgItem of mainCfgItems) {//validate new version app config items
    let arr = cfgItem.split(".")
    let flg = false
    switch (arr.length) {
      case 1:
        switch (cfgItem) {
          case "isOfekManager"://we allow false, but not undefined
          case "isPublicApp"://we allow false, but not undefined
          case "apiKeyHandler"://we allow null
          case "mapLayers"://we allow null
          //case "widgetsToHide":
          case "ofekCfg3dTiles"://we allow null or empty array
          case "lakeWaterHeight"://we allow null
          case "orbit45"://we allow null
          case "orbit360"://we allow null
            if (typeof (currMainCfgObj[arr[0]]) !== "undefined") {
              flg = true
            }
            break
          default:
            flg = currMainCfgObj[arr[0]]
            break
        }
        break
      case 2://`map.itemId`,`map.mapOptions`
        switch (cfgItem) {
          case "map.mapOptions"://we allow falsy (null), but not undefined
            if (typeof (currMainCfgObj[arr[0]]?.[arr[1]]) !== "undefined") {//app cfg
              flg = true
            } else if (typeof (currMainCfgObj[cfgItem]) !== "undefined") {//bldCfg
              flg = true
            }
            break
          case "map.itemId":
            if (currMainCfgObj[cfgItem]) {//bldCfg
              flg = true
            } else {
              flg = currMainCfgObj[arr[0]]?.[arr[1]]//app cfg
            }
            break
          case "map.portalUrl":
            if (currMainCfgObj[cfgItem]) {//bldCfg
              flg = true
            } else {
              flg = currMainCfgObj[arr[0]]?.[arr[1]]//app cfg
            }
            break
          default:
            flg = currMainCfgObj[arr[0]]?.[arr[1]]
            break
        }
        break
      case 3:
        flg = currMainCfgObj[arr[0]]?.[arr[1]]?.[arr[2]]
        break
      case 4:
        flg = currMainCfgObj[arr[0]]?.[arr[1]]?.[arr[2]]?.[arr[3]]
        break
      case 5:
        flg = currMainCfgObj[arr[0]]?.[arr[1]]?.[arr[2]]?.[arr[3]]?.[arr[4]]
        break
      case 6:
        flg = currMainCfgObj[arr[0]]?.[arr[1]]?.[arr[2]]?.[arr[3]]?.[arr[4]]?.[arr[5]]
        break
    }
    if (!flg && flg !== "") {
      missingItems.push(cfgItem)
    }
  }//for
  return missingItems
}
