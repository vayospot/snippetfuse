import globals from "globals";

export default [
    // Main extension code
    {
        files: ["src/**/*.js"],
        languageOptions: {
            globals: {
                ...globals.commonjs,
                ...globals.node,
                ...globals.mocha,
            },
            ecmaVersion: 2022,
            sourceType: "module",
        },
        rules: {
            "no-const-assign": "warn",
            "no-this-before-super": "warn",
            "no-undef": "warn",
            "no-unreachable": "warn",
            "no-unused-vars": "warn",
            "constructor-super": "warn",
            "valid-typeof": "warn",
        },
    },
    // Webview code (browser environment)
    {
        files: ["webview/**/*.js"],
        languageOptions: {
            globals: {
                ...globals.browser,
            },
            ecmaVersion: 2022,
            sourceType: "script",
        },
        rules: {
            "no-undef": "off",
        },
    },
];
