/* globals jasmine */
jasmine.DEFAULT_TIMEOUT_INTERVAL = 30 * 1000;

// Import all modules in context
function importAll(r) {
    r.keys().forEach(r);
}

// Import source directories
importAll(require.context('./Api', true, /.js$/));
importAll(require.context('./Core', true, /.js$/));
importAll(require.context('./Observer', true, /.js$/));
importAll(require.context('./Player', true, /.js$/));
importAll(require.context('./Services', true, /.js$/));
importAll(require.context('./Shim', true, /.js$/));
