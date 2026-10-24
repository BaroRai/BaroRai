import { defineConfig } from 'vite';
// Only deployment output may be emptied; source and documentation are siblings.
export default defineConfig({base:'./',build:{outDir:'../dist',emptyOutDir:true}});
