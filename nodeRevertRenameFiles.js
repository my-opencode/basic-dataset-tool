const fs = require(`node:fs/promises`);
const path = require(`node:path`);
const supportedFileExtensions = [`png`, `jpg`, `jpeg`];

(async function () {
  const targetArgument = (process.argv.filter(val => val.slice(0, 3) === `-t=`)[0] || ``).slice(3);
  if (!targetArgument) throw new Error(`Target argument is required (-t=target/directory)`);
  const targetDirectory = path.resolve(targetArgument);

  const renameLogFile = await fs.readFile(path.resolve(targetDirectory, `rename.log`), { encoding: `utf-8` });
  const renameLines = renameLogFile.split(`\n`);
  for (const line of renameLines) {
    const [_, before, after] = line.match(/^"([^"]+)" => "([^"]+)"/);
    try {
      await fs.rename(path.resolve(targetDirectory, after), path.resolve(targetDirectory, before));
    } catch (err) {
      console.log(`Unable to revert renaming of  "${after}" back to "${before}".`);
    }
  }
})();