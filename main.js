// Application configuration

/** Image extensions to find in the file system directory */
const IMAGE_EXTENSIONS = [`jpg`, `jpeg`, `png`];

// DOM dictionaries

/** Known DOM element ids */
const DOM_IDS = {
  datasetBody: `dataset-body`,
  datasetInfo: `dataset-info`,
  folderName: `folder-name`,
  folderPicker: `folder-picker`,
  folderRefresh: `folder-refresh`,
  guiOptions: `gui-options`,
  guiOptionsCLose: `gui-options-close`,
  guiOptionsToggle: `gui-options-toggle`,
  imageCounter: `image-counter`,
  optionZoomSize: `option-zoom-size`,
  optionZoomSizeViewer: `option-zoom-size-viewer`,
  snackbar: `snackbar`,
  snackbarButton: `snackbar-button`,
  snackbarService: `snackbar-service`,
  snackbarTime: `snackbar-time`,
  snackbarText: `snackbar-text`,
};
/**
 * Variable DOM element ids
 * @type {{[key:string]:(string,...args:string[])=>string}}
 */
const rowIdsMaker = {
  imageHeight: (stringI) => `height-${stringI}`,
  imageWidth: (stringI) => `width-${stringI}`,
  imageSizeQuality: (stringI) => `sizepill-${stringI}`,
  magickTexarea: (stringI) => `magick-${stringI}`,
  promptField: (filename) => `field-${filename}`,
};
/**
 * Supported DOM event types
 * @type {{[key:string]:keyof HTMLElementEventMap}}
 */
const DOM_EVENTS = {
  change: `change`,
  click: `click`,
};

// DOM Helpers

/**
 * Shorthand for getElementById
 * @param{String} id
 */
function $id(id) {
  if (typeof id !== `string` || !id?.length)
    throw new TypeError(`function $id(id:string) requires a string argument.`);
  return document.getElementById(id);
}
/**
 * Shorthand for getElementsByClassName
 * @param{String} className
 */
function $cl(className) {
  if (typeof className !== `string` || !className?.length)
    throw new TypeError(`function $cl(className:string) requires a string argument.`);
  return document.getElementsByClassName(className);
}
/**
 * Shorthand for addEventListener
 * @param{String|HTMLElement} idOrEl
 * @param{keyof HTMLElementEventMap} eventName
 * @param{(this: HTMLElement, ev: HTMLElementEventMap[keyof HTMLElementEventMap]) => any} cb
 */
function $on(idOrEl, eventName, cb) {
  /** @type {HTMLElement} */
  let el;
  if (idOrEl instanceof HTMLElement) {
    el = idOrEl;
  } else {
    if (typeof idOrEl !== `string` || !idOrEl?.length)
      throw new TypeError(`function $on(id:string, eventName:string, cb:()=>any) requires a string 'id' argument.`);
    if (typeof eventName !== `string` || !eventName?.length)
      throw new TypeError(`function $on(id:string, eventName:string, cb:()=>any) requires a string 'eventName' argument.`);
    if (!el)
      el = $id(idOrEl);
    if (!el)
      throw new Error(`Target element not found with id '${idOrEl}'.`);
  }
  if (!cb || !(cb instanceof Function))
    throw new TypeError(`function $on(id:string, eventName:string, cb:()=>any) requires a function 'cb' argument.`);
  el.addEventListener(eventName, cb);
}

// File system state

/**
 * File System handler of the work directory
 * @type{FileSystemDirectoryHandle|undefined}
 */
var dirH;
/**
 * @typedef FileObject
 * @type{Object}
 * @property {String} [filename]
 * @property {String} name
 * @property {String} [ext]
 * @property {Number} [width]
 * @property {Number} [height]
 * @property {String} [description]
 */
/** @type {FileObject} */
const sampleFileObject = {
  filename: `unique_image_name.ext`,
  name: `unique image name`,
  ext: `image extension`,
  width: 1,
  height: 1,
  description: `may be empty`
};
/** 
 * Bank of file objects
 * @type{Array<FileObject>} 
 */
var files = [];
/** 
 * Map of file objects indexed by their names
 * @type{Map<string,FileObject>} 
 */
var fileLookupTable = new Map();

// Save state

/** 
 * Bank of rows queued to be saved to file system
 * @type{Array<String>} 
 */
var updateQueue = [];
/**
 * Map of rows queue to be saved to file system indexed by file name 
 * @type{Set<string,string>} 
 */
var updateQueued = new Set();
/** 
 * The promise of the current save operation, a time out to the next operation or null.
 * @type{null|Promise<void>|number} 
 */
var queueController;

// GUI state

/**
 * Supported image zoom values in pixels
 * @type {Array<Number>}
 */
const zoomValues = [32, 64, 128, 256, 512, 1024];
/**
 * Selected zoom value in pixels
 * @type {Number}
 */
var zoomValue = 512;

// Entrypoints

/**
 * The main logic is triggered by the folderPicker button
 */
$on(DOM_IDS.folderPicker, DOM_EVENTS.click, entryPoint);
/**
 * folderRefresh triggers rebuilding the GUI table
 */
$on(DOM_IDS.folderRefresh, DOM_EVENTS.click, rebuildDatasetTable);
/**
 * controls of the GUI option modal
 */
$on(DOM_IDS.guiOptionsToggle, DOM_EVENTS.click, toggleGuiModal);
$on(DOM_IDS.guiOptionsCLose, DOM_EVENTS.click, closeGuiModal);
/**
 * listen to change in the zoom size option
 */
$on(DOM_IDS.optionZoomSize, DOM_EVENTS.change, applyZoom);

// EntryPoints

/**
 * Entry point triggered by clicking on the folder picker button
 * @param {Event & {target: HTMLButtonElement}} e
 */
async function entryPoint(e) {
  await selectDirectory();
  printDirectoryName();
  setSelectDirBtnLabelToChange();
  await rebuildDatasetTable();
}
/**
 * Reloads data and rebuilds the table
 */
async function rebuildDatasetTable() {
  if (!dirH) {
    showErrorToast(`Please select a folder.`, `Importer`);
    throw new Error(`dirH is not set. Run selectDirectory first.`);
  }
  await listFilesInDirectory();
  displayDatasetInfo();
  generateTable();
}
/**
 * Click event callback to remove images
 * @param{Event & {target: HTMLButtonElement}} e
 */
async function handleImageRemove(e) {
  if (!e?.target) {
    showErrorToast(`Image removal handler has no target element.`, `Image Remover`);
    throw new Error(`handle image remover event has no target element.`);
  }
  // Fetch data
  const rowId = e.target.dataset.target;
  const name = e.target.dataset.name;
  // File system update
  const fileInfo = fileLookupTable.get(name);
  if (!fileInfo) {
    showErrorToast(`Image to remove not found.`, `Image Remover`);
    throw new Error(`fileInfo not found.`);
  }
  const deleteResult = await removeImageAndTag(fileInfo);
  fileLookupTable.delete(name);
  files = files.filter(f => f.name !== name);
  // Dataset update
  if (deleteResult.deletedImage)
    updateImageCounter();
  if (!deleteResult.deletedTag)
    updateImageCounter();
  // DOM update
  removeTableRow(rowId);
}

// State updates

/**
 * Lists files in the directory of the directory handle.
 * Mutates files with an array sorted by name.
 */
async function listFilesInDirectory() {
  if (dirH)
    for await (const handle of dirH.values()) {
      if (handle.kind !== `file`) continue;
      const { name, ext } = fileNameToNameAndExt(handle.name);
      if (!ext) continue;
      /** @type{String} */
      const extL = ext.toLowerCase();
      if (!IMAGE_EXTENSIONS.includes(extL) && extL !== `txt`) continue;
      const file = initNewFile(name);
      if (extL === `txt`) {
        file.description = await readTextFileContents(handle);
      }
      else {
        file.filename = handle.name;
        file.ext = ext;
      }
    }
  files = files.sort((a, b) => a.name > b.name ? 1 : a.name < b.name ? -1 : 0);
}

// Computed state values
/**
 * Counts files missing description
 */
function getMissingDescCount() {
  return files.filter(f => !f.description).length;
}

// State actions

/**
 * Ensures that a file entry exists for name
 * @param {String} name
 * @returns {FileObject}
 */
function initNewFile(name) {
  if (!fileLookupTable.has(name)) {
    /** @type{FileObject} */
    const file = { name };
    fileLookupTable.set(name, file);
    files.push(file);
  }
  const file = fileLookupTable.get(name);
  // for the IDE
  if (!file) {
    showErrorToast(`File undefined after initiating a new file ${name}`, `File Initializer`);
    throw new Error(`file undefined after init.`);
  }
  return file;
}
/**
 * queues a prompt file save task only if it is not already queued
 * @param{Event & {target:HTMLElement}} e
 */
function queueChange(e) {
  if (!e?.target) {
    showErrorToast(`Change queuer handler has no target element.`, `Change Queuer`);
    throw new Error(`queue change handler event has no target element.`);
  }
  const name = e.target.dataset.name;
  if (!name) {
    showErrorToast(`Change target has no name.`, `Change Queuer`);
    throw new Error(`queue change handler target is missing data-name.`);
  }
  if (!updateQueued.has(name)) {
    updateQueue.push(name);
    updateQueued.add(name);
    if (!queueController)
      queueController = saveNextChange();
  }
}
/**
 * Queues a prompt file save task
 */
async function saveNextChange() {
  const name = updateQueue.shift();
  updateQueued.delete(name);

  const file = fileLookupTable.get(name);
  if (!file) {
    showErrorToast(`File not found for field ${name}`, `Saver`);
    throw new Error(`File not found for field ${name}`);
  }
  const newVal = /** @type{HTMLTextAreaElement} */ ($id(rowIdsMaker.promptField(name))).value.trim();
  if (newVal !== file.description) {
    await writeFile(`${file.name}.txt`, newVal);
    file.description = newVal;
  }
  if (updateQueue.length)
    queueController = setTimeout(saveNextChange, 1000);
  else queueController = null;
}

// Utility functions

/**
 * Splits the file name and file extension from the full file name
 * @param {String} fileName
 * @returns {{name:string;ext?:string}}
 */
function fileNameToNameAndExt(fileName) {
  const extIndex = fileName.lastIndexOf(`.`);
  if (extIndex === -1)
    //   throw new Error(`File without extension.`);
    return { name: fileName };
  return { name: fileName.slice(0, extIndex), ext: fileName.slice(extIndex + 1) };
}

// File System operations

/**
 * Restricts functionabilities to browsers supporting showDirectoryPicker
 */
function onlyOnChrome() {
  if (!window.showDirectoryPicker) {
    showErrorToast(`This functionality only works on Chrome.`);
    throw new Error(`This functionality only works on Chrome.`);
  }
}
/**
 * Selects the directory handler
 */
async function selectDirectory() {
  onlyOnChrome();
  let dirHandle = undefined;
  try {
    dirHandle = await window.showDirectoryPicker({
      mode: `readwrite`
    });
  }
  catch (err) {
    // user cancelled
    console.log(`User cancelled directory selection`);
    return showErrorToast("Select directory cancelled.", "Directory Selector");
  }
  if (!dirHandle) {
    showErrorToast("Invalid data folder.", "Directory Selector");
    throw new Error(`Invalid data folder.`);
  }
  dirH = dirHandle;
}
/**
 * Returns the contents of a file as string
 * @param{FileSystemFileHandle} fileHandle
 * @returns{Promise<String>}
 */
async function readTextFileContents(fileHandle) {
  const f = await fileHandle.getFile();
  const s = await f.text();
  return s || ``;
}
/**
 * Returns the content of an image file as a blob url
 * @param{String} fileName
 */
async function readImageFileContentsAsUrl(fileName) {
  if (!dirH) return;
  const handle = await dirH.getFileHandle(fileName);
  if (!handle) {
    showErrorToast(`File not found: "${fileName}".`, `Image URL reader`);
    throw new Error(`Cannot get handle for "${fileName}".`);
  }
  const file = await handle.getFile();
  return URL.createObjectURL(file);
}
/**
 * Writes file to file system
 * @param{String} filename
 * @param{String} contents
 */
async function writeFile(filename, contents) {
  const fileHandle = await dirH.getFileHandle(filename, {
    create: true,
  });
  // Create a FileSystemWritableFileStream to write to.
  const writable = await fileHandle.createWritable();
  // Write the contents of the file to the stream.
  await writable.write(contents);
  // console.log(`Not actually writing`);
  // console.log(contents);
  // Close the file and write the contents to disk.
  await writable.close();
}
/**
 * Returns the file system directory handle of the deleted directory
 */
async function getTrashDirectoryH() {
  if (!dirH) return;
  return await dirH.getDirectoryHandle(`deleted`, { create: true });
}
/**
 * Removes a file from the dataset directory and place it int the deleted sub directory
 * @param{String} filename
 */
async function removeFile(filename) {
  const srcFileHandle = await dirH.getFileHandle(filename);
  const delDirH = await getTrashDirectoryH();
  // @ts-ignore // .move exists on chrome
  await srcFileHandle.move(delDirH, filename);
}
/**
 * Removes an image and its prompt file
 * @param{FileObject} fileInfo
 * @returns {Promise<{deletedImage:boolean, deletedTag:boolean}>}
 */
async function removeImageAndTag(fileInfo) {
  const result = { deletedImage: false, deletedTag: false };
  await removeFile(fileInfo.filename);
  result.deletedImage = true;
  if (fileInfo.description) {
    await removeFile(fileInfo.name + `.txt`);
    result.deletedTag = true;
  }
  return result;
}

// GUI updates

/**
 * Prints the name of the folder in the DOM.
 */
function printDirectoryName() {
  if (dirH)
    $id(DOM_IDS.folderName).innerText = dirH.name;
}
/**
 * Updates the label of the folderPicker button after the initial folder selection
 */
function setSelectDirBtnLabelToChange() {
  $id(DOM_IDS.folderPicker).innerText = `Change directory`;
}
/**
 * Prints the number of images at the top of the page
 */
function updateImageCounter() {
  const el = $id(DOM_IDS.imageCounter);
  el.innerText = String(files.length);
}
/**
 * Prints the number of missing prompts at the top of the page
 */
function updateMissingDescCount() {
  $id(DOM_IDS.datasetInfoMissingCount).innerText = String(getMissingDescCount());
}
/**
 * Prints information about the dataset at the top of the page
 */
function displayDatasetInfo() {
  const el = $id(DOM_IDS.datasetInfo);
  el.innerHTML = ``;
  const counterEl = document.createElement(`span`);
  counterEl.setAttribute(`id`, DOM_IDS.imageCounter);
  counterEl.innerHTML = `${files.length}`;
  const imgCountText = document.createTextNode(` image${files.length > 1 ? `s` : ``} in dataset`);
  const sep = document.createElement(`br`);
  const missingCountLabel = document.createTextNode(`Number of image(s) missing tag description: `);
  const missingCount = document.createElement(`span`);
  DOM_IDS.datasetInfoMissingCount = `dataset-info-missing-count`;
  missingCount.setAttribute(`id`, DOM_IDS.datasetInfoMissingCount);
  el.appendChild(counterEl);
  el.appendChild(imgCountText);
  el.appendChild(sep);
  el.appendChild(missingCountLabel);
  el.appendChild(missingCount);
  updateMissingDescCount();
}
/**
 * Clears the content of the table.
 */
function resetTable() {
  $id(DOM_IDS.datasetBody).innerHTML = ``;
}
/**
 * Main function building the dataset table
 */
async function generateTable() {
  const tbody = $id(DOM_IDS.datasetBody);
  tbody.innerHTML = ``;
  let i = 0;
  const padlength = String(files.length).length;
  for (const file of files) {
    const rowId = `row_${i}`;
    i++;
    const stringI = String(i).padStart(padlength, `0`);
    const row = document.createElement(`tr`);
    row.setAttribute(`id`, rowId);
    row.classList.add(`dataset-row`);
    row.classList.add(i % 2 ? `even` : `odd`);
    // row number & image name
    const numberCell = document.createElement(`td`);
    numberCell.innerText = `${stringI} — ${file.name}`;
    const numberCellLineBreak = document.createElement(`br`);
    numberCell.appendChild(numberCellLineBreak);
    // image size
    numberCell.appendChild(createImageSizeElement(stringI));
    // image magick
    const magickTextAreaEl = document.createElement(`pre`);
    magickTextAreaEl.setAttribute(`id`, rowIdsMaker.magickTexarea(stringI));
    numberCell.appendChild(magickTextAreaEl);
    // image size quality
    const imgSizeQualityEl = document.createElement(`p`);
    imgSizeQualityEl.setAttribute(`id`, rowIdsMaker.imageSizeQuality(stringI));
    numberCell.append(imgSizeQualityEl);
    // remove button
    numberCell.appendChild(createImageRemoveButton(rowId, file));
    // image
    const imgCell = document.createElement(`td`);
    imgCell.appendChild(await createImageElement(stringI, file));
    // prompt
    const tagCell = document.createElement(`td`);
    const descriptionField = document.createElement(`textarea`);
    // descriptionField.setAttribute(`value`, file.description);
    descriptionField.setAttribute(`data-name`, file.name);
    descriptionField.setAttribute(`id`, rowIdsMaker.promptField(file.name));
    descriptionField.setAttribute(`style`, `width: ${zoomValue}px; min-height: ${zoomValue / 2}px`);
    descriptionField.setAttribute(`rows`, `20`);
    descriptionField.textContent = file.description || ``;
    tagCell.appendChild(descriptionField);

    row.appendChild(numberCell);
    row.appendChild(imgCell);
    row.appendChild(tagCell);
    tbody.appendChild(row);
    $on(descriptionField, DOM_EVENTS.change, queueChange);
  }
}
/**
 * Removes a DOM table row by its id.
 * @param{string} rowId
 */
function removeTableRow(rowId) {
  const row = $id(rowId);
  row.remove();
}

// GUI Dialog and Toasts

/**
 * Opens a Toast for an error message
 * @param{String} text The message of the error
 * @params{String} [service] The service from where the error originates
 * @params{String} [time] When the error occured
 */
function showErrorToast(text, service = "System", time = "just now") {
  const errorToast = $id(DOM_IDS.snackbar);
  if (!errorToast) throw new Error(`Toast DOM Element not found.`);

  $id(DOM_IDS.snackbarService).innerText = service;
  $id(DOM_IDS.snackbarTime).innerText = time;
  $id(DOM_IDS.snackbarText).innerText = text;

  errorToast.className = "show";
  setTimeout(closeErrorToast, 3000);
}
/**
 * Closes the error toast
 */
function closeErrorToast() {
  const tgt = $id(DOM_IDS.snackbar);
  tgt.className = tgt.className.replace("show", "");
}
/**
 * Shows the GUI modal element
 */
function toggleGuiModal() {
  const dialog = /** @type{HTMLDialogElement} */ ($id(DOM_IDS.guiOptions));
  dialog.classList.add(`open-dialog`);
  dialog.showModal();
}
/**
 * Closes the GUI modal element
 */
function closeGuiModal() {
  const dialog = /** @type{HTMLDialogElement} */ ($id(DOM_IDS.guiOptions));
  dialog.classList.remove(`open-dialog`);
  dialog.close();
}
/**
 * 
 * @param {Event & {target: HTMLInputElement}} e 
 */
function applyZoom(e) {
  zoomValue = zoomValues[parseInt(e.target.value)];
  $id(DOM_IDS.optionZoomSizeViewer).innerText = `${zoomValue}px`;
  const applyStyle = (el) => {
    el.setAttribute(`style`, `width: ${zoomValue}px;`);
  };
  document.querySelectorAll(`#${DOM_IDS.datasetBody} img`).forEach(applyStyle);
  document.querySelectorAll(`#${DOM_IDS.datasetBody} textarea`).forEach(applyStyle);
}
/**
 * Generator function to build the event listener of an image load
 * @param {String} stringI 
 * @returns {(this: HTMLElement, ev: HTMLElementEventMap[keyof HTMLElementEventMap]) => any}
 */
function DoAfterImageLoads(stringI) {
  return (
    /**   
     * @type {(event:Event & {target: HTMLImageElement})=>void}
     */
    (event) => {
      document.getElementById(rowIdsMaker.imageWidth(stringI)).innerText = String(event.target.naturalWidth);
      document.getElementById(rowIdsMaker.imageHeight(stringI)).innerText = String(event.target.naturalHeight);
      const imgSizeQualityId = rowIdsMaker.imageSizeQuality(stringI);
      document.getElementById(imgSizeQualityId).innerHTML = ``;
      document.getElementById(imgSizeQualityId).append(createImageQualityPill(event.target.naturalHeight, event.target.naturalHeight));

      testAddMagickExtentToTextArea(stringI, event.target.dataset.filename, event.target.naturalWidth, event.target.naturalHeight)
    });
}

// DOM element generators ≈ Front end modules

/**
 * Creates a pill html element for the quality of the size of the image
 * @param {Number} width
 * @param {Number} height
 * @returns {HTMLSpanElement}
 */
function createImageQualityPill(width, height) {
  const pill = document.createElement(`span`);
  let quality = (width === 1024 && height === 1024)
    ? `perfect`
    : (width >= 1024 && height >= 1024)
      ? `good`
      : (width >= 1024 || height >= 1024)
        ? `okay`
        : `bad`;
  pill.innerText = quality;
  pill.classList.add(`pill-${quality}`);
  return pill;
}
/**
 * Creates a HTML p element to display the size of the image
 * @param {String} stringI The padded index of the image in the array
 * @returns {HTMLParagraphElement}
 */
function createImageSizeElement(stringI) {
  const imgSizeEl = document.createElement(`p`);
  const imgHeightId = `height-${stringI}`;
  const imgWidthId = `width-${stringI}`;

  const imgWidthEl = document.createElement(`span`);
  imgWidthEl.setAttribute(`id`, imgWidthId);
  imgSizeEl.appendChild(imgWidthEl);
  const imgSizeXEl = document.createElement(`span`);
  imgSizeXEl.innerText = ` x `;
  imgSizeEl.appendChild(imgSizeXEl);
  const imgHeightEl = document.createElement(`span`);
  imgHeightEl.setAttribute(`id`, imgHeightId);
  imgSizeEl.appendChild(imgHeightEl);

  return imgSizeEl;
}
/**
 * Creates button de remove image
 * @param {String} rowId Table row html id
 * @param {FileObject} file 
 */
function createImageRemoveButton(rowId, file) {
  const removeButton = document.createElement(`button`);
  removeButton.setAttribute(`data-target`, rowId);
  removeButton.setAttribute(`data-name`, file.name);
  removeButton.innerText = `×`;
  removeButton.classList.add(`rmv-row-btn`);
  $on(removeButton, DOM_EVENTS.click, handleImageRemove);
  return removeButton;
}
/**
 * 
 * @param {string} stringI 
 * @param {FileObject} file 
 */
async function createImageElement(stringI, file) {
  const img = document.createElement(`img`);
  img.setAttribute(`width`, String(zoomValue));
  img.setAttribute(`src`, await readImageFileContentsAsUrl(file.filename));
  img.setAttribute(`data-filename`, file.filename);
  img.addEventListener(`load`, DoAfterImageLoads(stringI));
  return img;
}

// Image Magick 7 command generators

function createBackupCmd(imgName) {
  return `cp ${imgName} ${imgName}.bak;`;
}
function createMagickExtentWhiteCmd(imgName, width, height) {
  const longerSideLength = Math.max(width, height);
  return `magick ${imgName} -background white -gravity center -extent ${longerSideLength}x${longerSideLength} ${imgName};`;
}
function createMagickResizeCmd(imgName, width, height) {
  const longerSideLength = Math.max(width, height);
  return `magick ${imgName} -resize ${1024}x${1024}\\> ${imgName};`;
}
function createMagickCropCmd(imgName, width, height, gravity = `center`) {
  const shorterSideLength = Math.min(width, height);
  return `magick ${imgName} -gravity ${gravity} -crop ${shorterSideLength}x${shorterSideLength}+0+0 +repage ${imgName};`;
}
/**
 * For testing purposes. Writes attributes and contents to the textarea for imagemagick commands.
 * @param {String} stringI The padded index of the image in the array
 * @param {String} imgName The file name of the image
 * @param {Number} width
 * @param {Number} height
 */
function testAddMagickExtentToTextArea(stringI, imgName, width, height) {
  const el = document.getElementById(`magick-${stringI}`);
  el.setAttribute(`data-width`, String(width));
  el.setAttribute(`data-height`, String(height));
  el.setAttribute(`data-image`, imgName);
  el.innerText = el.innerText + `\n\n` +
    createBackupCmd(imgName) + `\n\n` +
    ((width >= 1024 && height >= 1024 && width !== height) ? createMagickCropCmd(imgName, width, height) : ``) + `\n\n` +
    (width !== height ? createMagickExtentWhiteCmd(imgName, width, height) : ``) + `\n\n` +
    ((width >= 1024 || height >= 1024) ? createMagickResizeCmd(imgName, width, height) : ``);
}