const fs = require(`node:fs/promises`);
const path = require(`node:path`);
const supportedFileExtensions = [`png`, `jpg`, `jpeg`];

(async function () {
  const targetArgument = (process.argv.filter(val => val.slice(0, 3) === `-t=`)[0] || ``).slice(3);
  if (!targetArgument) throw new Error(`Target argument is required (-t=target/directory)`);
  const targetDirectory = path.resolve(targetArgument);
  const files = await fs.readdir(targetDirectory);
  let i = 0;
  let updateLog = [];
  const padLength = String(files.length).length;
  const paddedNumber = (nbr) => String(nbr).padStart(padLength, `0`);
  for (const filename of files) {
    let extension = ``;
    if (supportedFileExtensions.includes(filename.slice(-3))) extension = filename.slice(-3);
    if (supportedFileExtensions.includes(filename.slice(-4))) extension = filename.slice(-4);
    if (!extension) continue;
    i++;
    const name = filename.slice(0, -(extension.length +1));
    const newName = paddedNumber(i);
    try {
      await fs.rename(path.resolve(targetDirectory, filename), path.resolve(targetDirectory, newName + `.` + extension));
      updateLog.push(`"${filename}" => "${newName + `.` + extension}"`);
    } catch (err) {
      console.log(`Unable to rename "${filename}".`);
    }
    try {
      await fs.rename(path.resolve(targetDirectory, name + `.txt`), path.resolve(targetDirectory, newName + `.txt`));
      updateLog.push(`"${name}.txt" => "${newName}.txt"`);
    } catch (err) {
      // don’t care
      console.log(`text file not found. "${name + `.txt`}"`);
    }
    await fs.writeFile(`rename.log`, updateLog.join(`\n`), { encoding: `utf-8` });
  }
})();