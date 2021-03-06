const scriptProperties = PropertiesService.getScriptProperties();
const cache = CacheService.getScriptCache();
var totalFiles = 0;
const maxFilesSoft =
  parseInt(scriptProperties.getProperty("maxFilesSoft")) || 100;
var exitScript = false;

//Start script again after successfull exit but still files remaining
const rescheduleSeconds =
  parseInt(scriptProperties.getProperty("rescheduleSeconds")) || 10;

//Start script again after timeout
const rescheduleTimeout =
  parseInt(scriptProperties.getProperty("rescheduleSeconds")) || 60 * 40;

const sourceFolderId = scriptProperties.getProperty("sourceFolderId"); //Copy from this folder
const targetFolderId = scriptProperties.getProperty("targetFolderId"); //Copy to this folder

function start() {
  // The source folder
  let sourceFolder = DriveApp.getFolderById(sourceFolderId);
  // Create the target folder
  let targetFolder = DriveApp.getFolderById(targetFolderId);

  Logger.log(`Starting file copy of ${maxFilesSoft} files`);
  Logger.log(`Source folder ${sourceFolder.getName()}`);
  Logger.log(`Target folder ${targetFolder.getName()}`);
  Logger.log(`Restart in ${rescheduleTimeout} seconds`);

  removeTriggers();

  ScriptApp.newTrigger("start")
    .timeBased()
    .after(rescheduleTimeout * 1000)
    .create();

  copyFolder(sourceFolder, targetFolder);
}

function fileExists(name, folderId) {
  var files = DriveApp.getFilesByName(name);
  while (files.hasNext()) {
    var file = files.next();
    var folders = file.getParents();
    if (folders.hasNext()) {
      var folder = folders.next();
      if (folder.getId() == folderId) {
        return file.getId();
      }
    }
  }
  return false;
}

function folderExists(name, folderId) {
  var folders = DriveApp.getFoldersByName(name);
  while (folders.hasNext()) {
    var folder = folders.next();
    var parentFolders = folder.getParents();
    if (parentFolders.hasNext()) {
      var parentFolder = parentFolders.next();
      if (parentFolder.getId() == folderId) {
        return folder.getId();
      }
    }
  }
  return false;
}

function copyFolder(sourceFolder, targetFolder) {
  let folderCacheKey = targetFolder.getId() + "_done";
  if(cache.get(folderCacheKey)){
    Logger.log(`Folder ${targetFolder.getName()} is done already`);
    return;
  }else{
    Logger.log(`Copying folder ${sourceFolder.getName()} to target ${targetFolder.getName()}`);
  }
  let subfolders;
  let tokenProperty = "contToken_" + targetFolder.getId();
  let contToken = scriptProperties.getProperty(tokenProperty);
  if (contToken) {
    Logger.log(`Continuation token found, continuing iteration`, contToken);
    subfolders = DriveApp.continueFolderIterator(contToken);
  } else {
    subfolders = sourceFolder.getFolders();
    scriptProperties.setProperty(
      tokenProperty,
      subfolders.getContinuationToken()
    );
  }

  while (subfolders.hasNext()) {
    var subfolder = subfolders.next();
    //Check if target folder exists and if it does then get it
    var newFolderId = folderExists(subfolder.getName(), targetFolder.getId());
    var targetSubfolder;
    if (newFolderId) {
      targetSubfolder = DriveApp.getFolderById(newFolderId);
    } else {
      targetSubfolder = targetFolder.createFolder(subfolder.getName());
    }
    copyFolder(subfolder, targetSubfolder);
    if (exitScript) {
      return;
    }
    scriptProperties.setProperty(
      tokenProperty,
      subfolders.getContinuationToken()
    );
  }

  // Copy all files in the folder
  copyFiles(sourceFolder, targetFolder);

  //Done with the continuation token
  scriptProperties.deleteProperty(tokenProperty);

  Logger.log(
    `Done with the folder ${sourceFolder.getName()}  total ${totalFiles} copied`
  );
  cache.put(folderCacheKey, true, 60*60);

  if (totalFiles >= maxFilesSoft) {
    removeTriggers();
    ScriptApp.newTrigger("start")
      .timeBased()
      .after(rescheduleSeconds * 1000)
      .create();
    Logger.log(`Trigger created for run in ${rescheduleSeconds} seconds`);
    exitScript = true;
  }
}

function removeTriggers() {
  var allTriggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < allTriggers.length; i++) {
    ScriptApp.deleteTrigger(allTriggers[i]);
  }
}

function copyFiles(sourceFolder, tFolder) {
  var files = sourceFolder.getFiles();
  
  while (files.hasNext()) {
    file = files.next();
    fileKey = `${file.getId()}-${tFolder.getId()}`;
    if(cache.get(fileKey) == "copied"){
      Logger.log(`File ${file.getName()}already copied`);
    }else{
      Logger.log(
        `Copying file ${file.getName()} to folder ${tFolder.getName()}`
      );
      totalFiles = totalFiles + 1;
      file.makeCopy(file.getName(), tFolder);
      cache.put(fileKey,"copied", 60*60);
    }  
  }
}
