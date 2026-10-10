// `server-only` throws when a file that imports it is bundled for the browser. Under test there is no
// browser bundle, so it is replaced by an empty module and the files can be loaded directly.
export {};
