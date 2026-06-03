// Generates all Tauri icon sizes from src-tauri/app-icon.svg
import { execSync } from 'child_process';
import { existsSync } from 'fs';

if (!existsSync('src-tauri/app-icon.svg')) {
  console.error('src-tauri/app-icon.svg not found. Run from project root.');
  process.exit(1);
}

console.log('Generating icons from src-tauri/app-icon.svg ...');
execSync('npx @tauri-apps/cli icon src-tauri/app-icon.svg', { stdio: 'inherit' });
console.log('Done. Icons written to src-tauri/icons/');
