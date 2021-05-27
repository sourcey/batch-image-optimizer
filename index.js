const sharp = require('sharp')
const glob = require('glob')
const chokidar = require('chokidar')
const {
  existsSync,
  ensureDir,
  readFileSync,
  writeFileSync,
  move
} = require('fs-extra')
const path = require('path')
const fs = require('fs')


const SOURCE_DIR = 'example/'
const OUTPUT_DIR = 'example/'
const TEMP_DIR = 'tmp/'
const MANIFEST_FILE = 'manifest.json'
const GLOB_PATTERN = '**/*'
const SKIP_PROCESSED_FILES = true
const SKIP_NON_ACTIVESTORAGE_FILES = true


function humanSize(size) {
  let i = Math.floor(Math.log(size) / Math.log(1024));
  return (size / Math.pow(1024, i)).toFixed(2) * 1 + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i];
}

function getFileSize(filePath) {
  const stat = fs.statSync(filePath)
  const {size} = stat
  return humanSize(size)
}

function isDirectory(filePath) {
  try {
    const stat = fs.lstatSync(filePath)
    return stat.isDirectory()
  } catch (e) {
    return false
  }
}

async function addToManifest(manifest, filePath, err, info) {
  if (!manifest[filePath]) {
    manifest[filePath] = {}
  }
  if (!err) {
    manifest[filePath] = {
      width: info.width,
      height: info.height,
      size: humanSize(info.size)
    }
  } else {
    manifest[filePath] = {
      error: err
    }
  }
}

function removeFromManifest(manifest, filePath) {
  if (manifest[filePath]) {
    delete manifest[filePath]
  }
}

function loadManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST_FILE, 'utf8'))
  } catch(err) {
    return {}
  }
}

function saveManifest(manifest) {
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2))
}

async function resizeImage(filePath) {
  const fileName = path.basename(filePath)
  const tmpPath = path.join(TEMP_DIR, fileName)
  const outPath = filePath.replace(SOURCE_DIR, OUTPUT_DIR)

  return await new Promise((resolve, reject) => {
    console.log('processing:', filePath)
    sharp(filePath)
      .resize(4096, 4096, {
        withoutEnlargement: true,
        fit: 'inside'
      })
      .jpeg({ mozjpeg: true })
      .toFile(tmpPath, (err, info) => {
        // console.log('\tinfo=', info)
        if (!err) {
          // console.log('\texistsSync=', tmpPath, existsSync(tmpPath))
          console.log('\tformat=', info.format)
          console.log('\tsize=', info.width, 'x', info.height)
          console.log('\tsrc=', getFileSize(filePath))
          console.log('\tdest=', humanSize(info.size))
          move(tmpPath, outPath, {overwrite: true})
          resolve(info)
        }
        else {
          console.log('\terror=', err)
          reject(err.toString())
        }
      })
  })
}

ensureDir(TEMP_DIR)
ensureDir(OUTPUT_DIR)
const manifest = loadManifest()

async function processImage(filePath) {
  if (SKIP_PROCESSED_FILES && manifest[filePath]) return
  if (SKIP_NON_ACTIVESTORAGE_FILES && (path.extname(filePath) !== '' ||
                                       path.basename(filePath).length !== 28)) return
  if (isDirectory(filePath)) return

  try {
    const info = await resizeImage(filePath)
    addToManifest(manifest, filePath, null, info)
  } catch(err) {
    addToManifest(manifest, filePath, err)
  }
  saveManifest(manifest)
}


// Watch filesystem
chokidar
  .watch(SOURCE_DIR + GLOB_PATTERN, {
    ignoreInitial: true
  })
  .on('add', async (filePath) => {
    await processImage(filePath)
  })


// Process filesystem
glob(SOURCE_DIR + GLOB_PATTERN, async (err, files) => {
  for (const filePath of files) {
    await processImage(filePath)
  }
})
