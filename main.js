
const IMAGE_EXTENSIONS = [`jpg`, `jpeg`, `png`];
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
 * @type {{[key:string]:keyof HTMLElementEventType}}
 */
const DOM_EVENTS = {
  change: `change`,
  click: `click`,
};
/** @type{FileSystemDirectoryHandle} */
var dirH;
/**
 * @typedef FileObject
 * @type{Object}
 * @property {String} [filename]
 * @property {String} name
 * @property {String} [ext]
 * @property {Number} width
 * @property {Number} height
 * @property {String} description
 */
/** @type {FileObject} */
const sampleFile = {
  filename: `unique_image_name.ext`,
  name: `unique image name`,
  ext: `image extension`,
  width: 1,
  height: 1,
  description: `may be empty`
};
/** @type{Array<FileObject>} */
var files = [];
/** @type{Map<string,FileObject>} */
var fileLookupTable = new Map();
/** @type{Array<String>} */
var updateQueue = [];
/** @type{Set<string,string>} */
var updateQueued = new Set();
/** @type{null|Promise<void>} */
var queueController;

const zoomValues = [32, 64, 128, 256, 512, 1024];
var zoomValue = 512;

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
 * @param{String|HTMLELement} idOrEl
 * @param{keyof HTMLElementEventType} eventName
 * @param{Function} cb
 */
function $on(idOrEl, eventName, cb) {
  let el;
  if (idOrEl instanceof HTMLElement) el = idOrEl;
  else if (typeof idOrEl !== `string` || !idOrEl?.length) throw new TypeError(`function $on(id:string, eventName:string, cb:()=>any) requires a string 'id' argument.`);
  if (typeof eventName !== `string` || !eventName?.length) throw new TypeError(`function $on(id:string, eventName:string, cb:()=>any) requires a string 'eventName' argument.`);
  if (!cb || !(cb instanceof Function)) throw new TypeError(`function $on(id:string, eventName:string, cb:()=>any) requires a function 'cb' argument.`);
  if (!el) el = $id(idOrEl);
  if (!el) throw new Error(`Target element not found with id '${id}'.`);
  el.addEventListener(eventName, cb);
}

// acts as entry point
$on(DOM_IDS.folderPicker, DOM_EVENTS.click, selectDirectory);
// refresh
$on(DOM_IDS.folderRefresh, DOM_EVENTS.click, loadDatasetTable);
// options gui
$on(DOM_IDS.guiOptionsToggle, DOM_EVENTS.click, toggleGuiModal);
$on(DOM_IDS.guiOptionsCLose, DOM_EVENTS.click, closeGuiModal);

function onlyOnChrome() {
  if (!window.showDirectoryPicker) {
    showErrorToast(`This functionality only works on Chrome.`);
    throw new Error(`This functionality only works on Chrome.`);
  }
}

/**
 * Handles for the select directory button click
 * @param {Event & {target: HTMLButtonElement}} e
 */
async function selectDirectory(e) {
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
  if (!dirHandle){
    showErrorToast("Invalid data folder.", "Directory Selector");
    throw new Error(`Invalid data folder.`);
  }
  dirH = dirHandle;

  setDirectoryName();
  setSelectDirBtnLabelToChange();

  await loadDatasetTable();
}
async function loadDatasetTable() {
  if (!dirH) {
    showErrorToast(`Please select a folder.`, `Importer`);
    return;
  }
  await listFilesInDirectory();
  displayDatasetInfo();
  generateTable();
}

function setDirectoryName() {
  if (dirH)
    $id(DOM_IDS.folderName).innerText = dirH.name;
}
function setSelectDirBtnLabelToChange() {
  $id(DOM_IDS.folderPicker).innerText = `Change directory`;
}

/**
 * Lists files in the directory of the directory handle.
 * Mutates files with an array sorted by name.
 */
async function listFilesInDirectory() {
  if (dirH)
    for await (const handle of dirH.values()) {
      if (handle.kind !== `file`) continue;
      const { name, ext } = getNameAndExtension(handle.name);
      if (!ext) continue;
      /** @type{String} */
      const extL = ext.toLowerCase();
      if (!IMAGE_EXTENSIONS.includes(extL) && extL !== `txt`) continue;
      const file = initNewFile(name);
      if (extL === `txt`) {
        file.description = await dataFileToString(handle);
      }
      else {
        file.filename = handle.name;
        file.ext = ext;
      }
    }
  files = files.sort((a, b) => a.name > b.name ? 1 : a.name < b.name ? -1 : 0);
}
/**
 * Counts files missing description
 */
function getMissingDescCount() {
  return files.filter(f => !f.description).length;
}

/**
 * Splits the file name and file extension from the full file name
 * @param {String} fileName
 * @returns {{name:string;ext?:string}}
 */
function getNameAndExtension(fileName) {
  const extIndex = fileName.lastIndexOf(`.`);
  if (extIndex === -1)
    //   throw new Error(`File without extension.`);
    return { name: fileName };
  return { name: fileName.slice(0, extIndex), ext: fileName.slice(extIndex + 1) };
}
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
 * Returns the contents of a file as string
 * @param{FileSystemHandle} fileHandle
 * @returns{String}
 */
async function dataFileToString(fileHandle) {
  const f = await fileHandle.getFile();
  const s = await f.text();
  return s || ``;
}

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
function updateMissingDescCount() {
  $id(DOM_IDS.datasetInfoMissingCount).innerText = getMissingDescCount();
}
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
    magickTextAreaEl.setAttribute(`id`, `magick-${stringI}`);
    numberCell.appendChild(magickTextAreaEl);
    // image size quality
    const imgSizeQualityId = `sizepill-${stringI}`;
    const imgSizeQualityEl = document.createElement(`p`);
    imgSizeQualityEl.setAttribute(`id`, imgSizeQualityId);
    numberCell.append(imgSizeQualityEl);
    // remove button
    const removeButton = document.createElement(`button`);
    removeButton.setAttribute(`data-target`, rowId);
    removeButton.setAttribute(`data-name`, file.name);
    removeButton.innerText = `×`;
    removeButton.classList.add(`rmv-row-btn`);
    numberCell.appendChild(createImageRemoveButton(rowId, file));
    // image
    const imgCell = document.createElement(`td`);
    const img = document.createElement(`img`);
    img.setAttribute(`width`, String(zoomValue));
    img.setAttribute(`src`, await getImgUrl(file.filename));
    img.setAttribute(`data-filename`, file.filename);
    img.addEventListener(`load`, (event) => {
      document.getElementById(imgWidthId).innerText = event.target.naturalWidth;
      document.getElementById(imgHeightId).innerText = event.target.naturalHeight;

      document.getElementById(imgSizeQualityId).innerHTML = ``;
      document.getElementById(imgSizeQualityId).append(createImageQualityPill(event.target.naturalHeight, event.target.naturalHeight));

      testAddMagickExtentToTextArea(stringI, event.target.dataset.filename, event.target.naturalWidth, event.target.naturalHeight)
    });
    imgCell.appendChild(img);
    // prompt
    const tagCell = document.createElement(`td`);
    const descriptionField = document.createElement(`textarea`);
    // descriptionField.setAttribute(`value`, file.description);
    descriptionField.setAttribute(`data-name`, file.name);
    descriptionField.setAttribute(`id`, `field-${file.name}`);
    descriptionField.setAttribute(`style`, `width: ${zoomValue}px; min-height: ${zoomValue / 2}px`);
    descriptionField.setAttribute(`rows`, 20);
    descriptionField.textContent = file.description || ``;
    tagCell.appendChild(descriptionField);

    row.appendChild(numberCell);
    row.appendChild(imgCell);
    row.appendChild(tagCell);
    tbody.appendChild(row);
    $on(descriptionField, DOM_EVENTS.change, queueChange);
    $on(removeButton, DOM_EVENTS.click, handleImageRemove);
  }
}
function resetTable() {
  $id(DOM_IDS.datasetBody).innerHTML = ``;
}
/**
 * @param{String} filename
 */
async function getImgUrl(filename) {
  if (!dirH) return;
  const handle = await dirH.getFileHandle(filename);
  if (!handle) {
    showErrorToast(`File not found: "${filename}".`, `Image URL reader`);
    throw new Error(`Cannot get handle for "${filename}".`);
  }
  const file = await handle.getFile();
  return URL.createObjectURL(file);
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
  const newVal = $id(`field-${name}`).value.trim();
  if (newVal !== file.description); {
    await writeFile(`${file.name}.txt`, newVal);
    file.description = newVal;
  }
  if (updateQueue.length)
    queueController = setTimeout(saveNextChange, 1000);
  else queueController = null;
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
    updateImageCounter(files.length);
  if (!deleteResult.deletedTag)
    updateImageCounter();
  // DOM update
  removeTableRow(rowId);
}
/**
 * Removes a DOM table row by its id.
 * @param{string} rowId
 */
function removeTableRow(rowId) {
  const row = $id(rowId);
  row.remove();
}
/**
 * Removes an image file
 * @param{String} filename
 */
async function removeFile(filename) {
  const srcFileHandle = await dirH.getFileHandle(filename);
  const delDirH = await getTrashDirectoryH();
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
function updateImageCounter() {
  const el = $id(DOM_IDS.imageCounter);
  el.innerText = String(files.length);
}

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
function closeErrorToast() {
  const tgt = $id(DOM_IDS.snackbar);
  tgt.className = tgt.className.replace("show", "");
}

function toggleGuiModal() {
  const dialog = $id(DOM_IDS.guiOptions);
  dialog.classList.add(`open-dialog`);
  dialog.showModal();
}
function closeGuiModal() {
  const dialog = $id(DOM_IDS.guiOptions);
  dialog.classList.remove(`open-dialog`);
  $id(DOM_IDS.guiOptions).close();
}

$on(DOM_IDS.optionZoomSize, DOM_EVENTS.change, applyZoom);
function applyZoom(e) {
  zoomValue = zoomValues[parseInt(e.target.value)];
  $id(DOM_IDS.optionZoomSizeViewer).innerText = `${zoomValue}px`;
  const applyStyle = (el) => {
    el.setAttribute(`style`, `width: ${zoomValue}px;`);
  };
  document.querySelectorAll(`#${DOM_IDS.datasetBody} img`).forEach(applyStyle);
  document.querySelectorAll(`#${DOM_IDS.datasetBody} textarea`).forEach(applyStyle);
}


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
  el.setAttribute(`data-width`, width);
  el.setAttribute(`data-height`, height);
  el.setAttribute(`data-image`, imgName);
  el.innerText = el.innerText + `\n\n` +
    createBackupCmd(imgName) + `\n\n` +
    ((width >= 1024 && height >= 1024 && width !== height) ? createMagickCropCmd(imgName, width, height) : ``) + `\n\n` +
    (width !== height ? createMagickExtentWhiteCmd(imgName, width, height) : ``) + `\n\n` +
    ((width >= 1024 || height >= 1024) ? createMagickResizeCmd(imgName, width, height) : ``);
}

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