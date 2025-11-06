import fs from 'fs';

export function readText(filePath, description = 'file') {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (error) {
    console.error(`Error reading ${description} from ${filePath}:`, error.message);
    throw error;
  }
}

export function readJson(filePath, description = 'JSON file') {
  try {
    const content = readText(filePath, description);
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error parsing ${description} from ${filePath}:`, error.message);
    throw error;
  }
}

export function exists(filePath) {
  return fs.existsSync(filePath);
}

export function readDirectory(dirPath, filter = null) {
  try {
    const files = fs.readdirSync(dirPath);
    return filter ? files.filter(filter) : files;
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error.message);
    return [];
  }
}

