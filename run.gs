const scriptProperties = PropertiesService.getScriptProperties();
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
const donefileId = scriptProperties.getProperty("donefileId"); // Make sure this file exists, just an empty file named done to indicate this folder is done
var doneFile;

function start() {
  // The source folder
  let sourceFolder = DriveApp.getFolderById(sourceFolderId);
  // Create the target folder
  let targetFolder = DriveApp.getFolderById(targetFolderId);

  Logger.log("Starting file copy of " + maxFilesSoft + " files");
  Logger.log("Source folder " + sourceFolder.getName());
  Logger.log("Target folder " + targetFolder.getName());
  Logger.log("Restart in " + rescheduleTimeout + " seconds");

  doneFile = DriveApp.getFileById(donefileId);
  removeTriggers();
  ScriptApp.newTrigger("start")
    .timeBased()
    .after(rescheduleTimeout * 1000)
    .create();

  // Copy self as the first folder
  copyFolder(sourceFolder, targetFolder);
}

function createDoneFile(targetFolder) {
  doneFile.makeCopy("done", targetFolder);
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
  //Check if target folder says we are done
  if (fileExists("done", targetFolder.getId())) {
    Logger.log("Folder " + targetFolder.getName() + " is done already");
    return;
  }

  Logger.log(
    "Copying folder " +
      sourceFolder.getName() +
      " to target " +
      targetFolder.getName()
  );
  let subfolders;
  let contToken = "";
  let contFileId = fileExists("contToken", targetFolder.getId());
  if (contFileId) {
    Logger.log("Continuation token found, continuing iteration");
    contToken = DocumentApp.getFileById(contFileId)
      .getBody()
      .getText();
    subfolders = DriveApp.continueFolderIterator(contToken);
  } else {
    subfolders = sourceFolder.getFolders();
    let contFile = doneFile.makeCopy("contToken", targetFolder);
    contFile.setContent(subfolders.getContinuationToken());
    contFileId = contFile.getId();
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
    DriveApp.getFileById(contFileId).setContent(
      subfolders.getContinuationToken()
    );
  }

  // Copy all files in the folder
  copyFiles(sourceFolder, targetFolder);

  createDoneFile(targetFolder);

  //Remove continuation file
  Drive.Files.remove(contFileId);

  Logger.log(
    "Done with the folder " +
      sourceFolder.getName() +
      " total " +
      totalFiles +
      " copied"
  );
  if (totalFiles >= maxFilesSoft) {
    Logger.log(
      "Exiting because we have reached the limit, schedule to run again in " +
        rescheduleSeconds
    );
    removeTriggers();
    ScriptApp.newTrigger("start")
      .timeBased()
      .after(rescheduleSeconds * 1000)
      .create();
    Logger.log("Trigger created");
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
  // Copy all the files
  var files = sourceFolder.getFiles();

  while (files.hasNext()) {
    file = files.next();
    if (fileExists(file.getName(), tFolder.getId())) {
      Logger.log("File already exists: " + file.getName());
    } else {
      Logger.log(
        "Copying file " + file.getName() + " to folder " + tFolder.getName()
      );
      totalFiles = totalFiles + 1;
      file.makeCopy(file.getName(), tFolder);
    }
  }
}
