"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "app/api/auth/[...nextauth]/route";
exports.ids = ["app/api/auth/[...nextauth]/route"];
exports.modules = {

/***/ "mongoose":
/*!***************************!*\
  !*** external "mongoose" ***!
  \***************************/
/***/ ((module) => {

module.exports = require("mongoose");

/***/ }),

/***/ "../../client/components/action-async-storage.external":
/*!*******************************************************************************!*\
  !*** external "next/dist/client/components/action-async-storage.external.js" ***!
  \*******************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/client/components/action-async-storage.external.js");

/***/ }),

/***/ "../../client/components/request-async-storage.external":
/*!********************************************************************************!*\
  !*** external "next/dist/client/components/request-async-storage.external.js" ***!
  \********************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/client/components/request-async-storage.external.js");

/***/ }),

/***/ "../../client/components/static-generation-async-storage.external":
/*!******************************************************************************************!*\
  !*** external "next/dist/client/components/static-generation-async-storage.external.js" ***!
  \******************************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/client/components/static-generation-async-storage.external.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-page.runtime.dev.js":
/*!*************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-page.runtime.dev.js" ***!
  \*************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-page.runtime.dev.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-route.runtime.dev.js":
/*!**************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-route.runtime.dev.js" ***!
  \**************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-route.runtime.dev.js");

/***/ }),

/***/ "assert":
/*!*************************!*\
  !*** external "assert" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("assert");

/***/ }),

/***/ "buffer":
/*!*************************!*\
  !*** external "buffer" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("buffer");

/***/ }),

/***/ "crypto":
/*!*************************!*\
  !*** external "crypto" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("crypto");

/***/ }),

/***/ "events":
/*!*************************!*\
  !*** external "events" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("events");

/***/ }),

/***/ "http":
/*!***********************!*\
  !*** external "http" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("http");

/***/ }),

/***/ "https":
/*!************************!*\
  !*** external "https" ***!
  \************************/
/***/ ((module) => {

module.exports = require("https");

/***/ }),

/***/ "querystring":
/*!******************************!*\
  !*** external "querystring" ***!
  \******************************/
/***/ ((module) => {

module.exports = require("querystring");

/***/ }),

/***/ "url":
/*!**********************!*\
  !*** external "url" ***!
  \**********************/
/***/ ((module) => {

module.exports = require("url");

/***/ }),

/***/ "util":
/*!***********************!*\
  !*** external "util" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("util");

/***/ }),

/***/ "zlib":
/*!***********************!*\
  !*** external "zlib" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("zlib");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fauth%2F%5B...nextauth%5D%2Froute&page=%2Fapi%2Fauth%2F%5B...nextauth%5D%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2F%5B...nextauth%5D%2Froute.ts&appDir=E%3A%5CQuickAI%20Short%20orignal%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=E%3A%5CQuickAI%20Short%20orignal&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!":
/*!**************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fauth%2F%5B...nextauth%5D%2Froute&page=%2Fapi%2Fauth%2F%5B...nextauth%5D%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2F%5B...nextauth%5D%2Froute.ts&appDir=E%3A%5CQuickAI%20Short%20orignal%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=E%3A%5CQuickAI%20Short%20orignal&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \**************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   originalPathname: () => (/* binding */ originalPathname),\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   requestAsyncStorage: () => (/* binding */ requestAsyncStorage),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   staticGenerationAsyncStorage: () => (/* binding */ staticGenerationAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/future/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/future/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/future/route-kind */ \"(rsc)/./node_modules/next/dist/server/future/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var E_QuickAI_Short_orignal_src_app_api_auth_nextauth_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./src/app/api/auth/[...nextauth]/route.ts */ \"(rsc)/./src/app/api/auth/[...nextauth]/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"\"\nconst routeModule = new next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/auth/[...nextauth]/route\",\n        pathname: \"/api/auth/[...nextauth]\",\n        filename: \"route\",\n        bundlePath: \"app/api/auth/[...nextauth]/route\"\n    },\n    resolvedPagePath: \"E:\\\\QuickAI Short orignal\\\\src\\\\app\\\\api\\\\auth\\\\[...nextauth]\\\\route.ts\",\n    nextConfigOutput,\n    userland: E_QuickAI_Short_orignal_src_app_api_auth_nextauth_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { requestAsyncStorage, staticGenerationAsyncStorage, serverHooks } = routeModule;\nconst originalPathname = \"/api/auth/[...nextauth]/route\";\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        serverHooks,\n        staticGenerationAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIuanM/bmFtZT1hcHAlMkZhcGklMkZhdXRoJTJGJTVCLi4ubmV4dGF1dGglNUQlMkZyb3V0ZSZwYWdlPSUyRmFwaSUyRmF1dGglMkYlNUIuLi5uZXh0YXV0aCU1RCUyRnJvdXRlJmFwcFBhdGhzPSZwYWdlUGF0aD1wcml2YXRlLW5leHQtYXBwLWRpciUyRmFwaSUyRmF1dGglMkYlNUIuLi5uZXh0YXV0aCU1RCUyRnJvdXRlLnRzJmFwcERpcj1FJTNBJTVDUXVpY2tBSSUyMFNob3J0JTIwb3JpZ25hbCU1Q3NyYyU1Q2FwcCZwYWdlRXh0ZW5zaW9ucz10c3gmcGFnZUV4dGVuc2lvbnM9dHMmcGFnZUV4dGVuc2lvbnM9anN4JnBhZ2VFeHRlbnNpb25zPWpzJnJvb3REaXI9RSUzQSU1Q1F1aWNrQUklMjBTaG9ydCUyMG9yaWduYWwmaXNEZXY9dHJ1ZSZ0c2NvbmZpZ1BhdGg9dHNjb25maWcuanNvbiZiYXNlUGF0aD0mYXNzZXRQcmVmaXg9Jm5leHRDb25maWdPdXRwdXQ9JnByZWZlcnJlZFJlZ2lvbj0mbWlkZGxld2FyZUNvbmZpZz1lMzAlM0QhIiwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7OztBQUFzRztBQUN2QztBQUNjO0FBQ3VCO0FBQ3BHO0FBQ0E7QUFDQTtBQUNBLHdCQUF3QixnSEFBbUI7QUFDM0M7QUFDQSxjQUFjLHlFQUFTO0FBQ3ZCO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQSxZQUFZO0FBQ1osQ0FBQztBQUNEO0FBQ0E7QUFDQTtBQUNBLFFBQVEsaUVBQWlFO0FBQ3pFO0FBQ0E7QUFDQSxXQUFXLDRFQUFXO0FBQ3RCO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDdUg7O0FBRXZIIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vcXVpY2thaS1zaG9ydHMvPzZhMTQiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwUm91dGVSb3V0ZU1vZHVsZSB9IGZyb20gXCJuZXh0L2Rpc3Qvc2VydmVyL2Z1dHVyZS9yb3V0ZS1tb2R1bGVzL2FwcC1yb3V0ZS9tb2R1bGUuY29tcGlsZWRcIjtcbmltcG9ydCB7IFJvdXRlS2luZCB9IGZyb20gXCJuZXh0L2Rpc3Qvc2VydmVyL2Z1dHVyZS9yb3V0ZS1raW5kXCI7XG5pbXBvcnQgeyBwYXRjaEZldGNoIGFzIF9wYXRjaEZldGNoIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvbGliL3BhdGNoLWZldGNoXCI7XG5pbXBvcnQgKiBhcyB1c2VybGFuZCBmcm9tIFwiRTpcXFxcUXVpY2tBSSBTaG9ydCBvcmlnbmFsXFxcXHNyY1xcXFxhcHBcXFxcYXBpXFxcXGF1dGhcXFxcWy4uLm5leHRhdXRoXVxcXFxyb3V0ZS50c1wiO1xuLy8gV2UgaW5qZWN0IHRoZSBuZXh0Q29uZmlnT3V0cHV0IGhlcmUgc28gdGhhdCB3ZSBjYW4gdXNlIHRoZW0gaW4gdGhlIHJvdXRlXG4vLyBtb2R1bGUuXG5jb25zdCBuZXh0Q29uZmlnT3V0cHV0ID0gXCJcIlxuY29uc3Qgcm91dGVNb2R1bGUgPSBuZXcgQXBwUm91dGVSb3V0ZU1vZHVsZSh7XG4gICAgZGVmaW5pdGlvbjoge1xuICAgICAgICBraW5kOiBSb3V0ZUtpbmQuQVBQX1JPVVRFLFxuICAgICAgICBwYWdlOiBcIi9hcGkvYXV0aC9bLi4ubmV4dGF1dGhdL3JvdXRlXCIsXG4gICAgICAgIHBhdGhuYW1lOiBcIi9hcGkvYXV0aC9bLi4ubmV4dGF1dGhdXCIsXG4gICAgICAgIGZpbGVuYW1lOiBcInJvdXRlXCIsXG4gICAgICAgIGJ1bmRsZVBhdGg6IFwiYXBwL2FwaS9hdXRoL1suLi5uZXh0YXV0aF0vcm91dGVcIlxuICAgIH0sXG4gICAgcmVzb2x2ZWRQYWdlUGF0aDogXCJFOlxcXFxRdWlja0FJIFNob3J0IG9yaWduYWxcXFxcc3JjXFxcXGFwcFxcXFxhcGlcXFxcYXV0aFxcXFxbLi4ubmV4dGF1dGhdXFxcXHJvdXRlLnRzXCIsXG4gICAgbmV4dENvbmZpZ091dHB1dCxcbiAgICB1c2VybGFuZFxufSk7XG4vLyBQdWxsIG91dCB0aGUgZXhwb3J0cyB0aGF0IHdlIG5lZWQgdG8gZXhwb3NlIGZyb20gdGhlIG1vZHVsZS4gVGhpcyBzaG91bGRcbi8vIGJlIGVsaW1pbmF0ZWQgd2hlbiB3ZSd2ZSBtb3ZlZCB0aGUgb3RoZXIgcm91dGVzIHRvIHRoZSBuZXcgZm9ybWF0LiBUaGVzZVxuLy8gYXJlIHVzZWQgdG8gaG9vayBpbnRvIHRoZSByb3V0ZS5cbmNvbnN0IHsgcmVxdWVzdEFzeW5jU3RvcmFnZSwgc3RhdGljR2VuZXJhdGlvbkFzeW5jU3RvcmFnZSwgc2VydmVySG9va3MgfSA9IHJvdXRlTW9kdWxlO1xuY29uc3Qgb3JpZ2luYWxQYXRobmFtZSA9IFwiL2FwaS9hdXRoL1suLi5uZXh0YXV0aF0vcm91dGVcIjtcbmZ1bmN0aW9uIHBhdGNoRmV0Y2goKSB7XG4gICAgcmV0dXJuIF9wYXRjaEZldGNoKHtcbiAgICAgICAgc2VydmVySG9va3MsXG4gICAgICAgIHN0YXRpY0dlbmVyYXRpb25Bc3luY1N0b3JhZ2VcbiAgICB9KTtcbn1cbmV4cG9ydCB7IHJvdXRlTW9kdWxlLCByZXF1ZXN0QXN5bmNTdG9yYWdlLCBzdGF0aWNHZW5lcmF0aW9uQXN5bmNTdG9yYWdlLCBzZXJ2ZXJIb29rcywgb3JpZ2luYWxQYXRobmFtZSwgcGF0Y2hGZXRjaCwgIH07XG5cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWFwcC1yb3V0ZS5qcy5tYXAiXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fauth%2F%5B...nextauth%5D%2Froute&page=%2Fapi%2Fauth%2F%5B...nextauth%5D%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2F%5B...nextauth%5D%2Froute.ts&appDir=E%3A%5CQuickAI%20Short%20orignal%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=E%3A%5CQuickAI%20Short%20orignal&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!\n");

/***/ }),

/***/ "(rsc)/./src/app/api/auth/[...nextauth]/route.ts":
/*!*************************************************!*\
  !*** ./src/app/api/auth/[...nextauth]/route.ts ***!
  \*************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   GET: () => (/* binding */ handler),\n/* harmony export */   POST: () => (/* binding */ handler)\n/* harmony export */ });\n/* harmony import */ var next_auth__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next-auth */ \"(rsc)/./node_modules/next-auth/index.js\");\n/* harmony import */ var next_auth__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_auth__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var _lib_auth_options__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @/lib/auth/options */ \"(rsc)/./src/lib/auth/options.ts\");\n\n\nconst handler = next_auth__WEBPACK_IMPORTED_MODULE_0___default()(_lib_auth_options__WEBPACK_IMPORTED_MODULE_1__.authOptions);\n\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvYXBwL2FwaS9hdXRoL1suLi5uZXh0YXV0aF0vcm91dGUudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7QUFBaUM7QUFDZ0I7QUFFakQsTUFBTUUsVUFBVUYsZ0RBQVFBLENBQUNDLDBEQUFXQTtBQUVPIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vcXVpY2thaS1zaG9ydHMvLi9zcmMvYXBwL2FwaS9hdXRoL1suLi5uZXh0YXV0aF0vcm91dGUudHM/MDA5OCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgTmV4dEF1dGggZnJvbSBcIm5leHQtYXV0aFwiO1xyXG5pbXBvcnQgeyBhdXRoT3B0aW9ucyB9IGZyb20gXCJAL2xpYi9hdXRoL29wdGlvbnNcIjtcclxuXHJcbmNvbnN0IGhhbmRsZXIgPSBOZXh0QXV0aChhdXRoT3B0aW9ucyk7XHJcblxyXG5leHBvcnQgeyBoYW5kbGVyIGFzIEdFVCwgaGFuZGxlciBhcyBQT1NUIH07XHJcbiJdLCJuYW1lcyI6WyJOZXh0QXV0aCIsImF1dGhPcHRpb25zIiwiaGFuZGxlciIsIkdFVCIsIlBPU1QiXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./src/app/api/auth/[...nextauth]/route.ts\n");

/***/ }),

/***/ "(rsc)/./src/lib/auth/options.ts":
/*!*********************************!*\
  !*** ./src/lib/auth/options.ts ***!
  \*********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   authOptions: () => (/* binding */ authOptions)\n/* harmony export */ });\n/* harmony import */ var next_auth_providers_google__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next-auth/providers/google */ \"(rsc)/./node_modules/next-auth/providers/google.js\");\n/* harmony import */ var _lib_db_mongodb__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @/lib/db/mongodb */ \"(rsc)/./src/lib/db/mongodb.ts\");\n/* harmony import */ var _lib_db_models_user__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @/lib/db/models/user */ \"(rsc)/./src/lib/db/models/user.ts\");\n\n\n\nconst authOptions = {\n    providers: [\n        (0,next_auth_providers_google__WEBPACK_IMPORTED_MODULE_0__[\"default\"])({\n            clientId: process.env.GOOGLE_CLIENT_ID,\n            clientSecret: process.env.GOOGLE_CLIENT_SECRET\n        })\n    ],\n    callbacks: {\n        async signIn ({ user, account, profile }) {\n            if (account?.provider === \"google\") {\n                try {\n                    await (0,_lib_db_mongodb__WEBPACK_IMPORTED_MODULE_1__[\"default\"])();\n                    const existingUser = await _lib_db_models_user__WEBPACK_IMPORTED_MODULE_2__[\"default\"].findOne({\n                        email: user.email\n                    });\n                    if (!existingUser) {\n                        await _lib_db_models_user__WEBPACK_IMPORTED_MODULE_2__[\"default\"].create({\n                            googleId: account.providerAccountId,\n                            email: user.email,\n                            name: user.name,\n                            image: user.image\n                        });\n                    } else {\n                        existingUser.lastLoginAt = new Date();\n                        existingUser.googleId = account.providerAccountId; // Ensure ID is updated\n                        await existingUser.save();\n                    }\n                    return true;\n                } catch (error) {\n                    console.error(\"Error during sign in:\", error);\n                    return false;\n                }\n            }\n            return true;\n        },\n        async session ({ session }) {\n            if (session.user) {\n                await (0,_lib_db_mongodb__WEBPACK_IMPORTED_MODULE_1__[\"default\"])();\n                const dbUser = await _lib_db_models_user__WEBPACK_IMPORTED_MODULE_2__[\"default\"].findOne({\n                    email: session.user.email\n                });\n                if (dbUser) {\n                    session.user.id = dbUser._id.toString();\n                    session.user.settings = dbUser.settings;\n                }\n            }\n            return session;\n        }\n    },\n    session: {\n        strategy: \"jwt\"\n    },\n    pages: {\n        signIn: \"/signin\"\n    }\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvbGliL2F1dGgvb3B0aW9ucy50cyIsIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQ3dEO0FBQ2Y7QUFDRDtBQUVqQyxNQUFNRyxjQUErQjtJQUMxQ0MsV0FBVztRQUNUSixzRUFBY0EsQ0FBQztZQUNiSyxVQUFVQyxRQUFRQyxHQUFHLENBQUNDLGdCQUFnQjtZQUN0Q0MsY0FBY0gsUUFBUUMsR0FBRyxDQUFDRyxvQkFBb0I7UUFDaEQ7S0FDRDtJQUNEQyxXQUFXO1FBQ1QsTUFBTUMsUUFBTyxFQUFFQyxJQUFJLEVBQUVDLE9BQU8sRUFBRUMsT0FBTyxFQUFFO1lBQ3JDLElBQUlELFNBQVNFLGFBQWEsVUFBVTtnQkFDbEMsSUFBSTtvQkFDRixNQUFNZiwyREFBU0E7b0JBQ2YsTUFBTWdCLGVBQWUsTUFBTWYsMkRBQUlBLENBQUNnQixPQUFPLENBQUM7d0JBQUVDLE9BQU9OLEtBQUtNLEtBQUs7b0JBQUM7b0JBRTVELElBQUksQ0FBQ0YsY0FBYzt3QkFDakIsTUFBTWYsMkRBQUlBLENBQUNrQixNQUFNLENBQUM7NEJBQ2hCQyxVQUFVUCxRQUFRUSxpQkFBaUI7NEJBQ25DSCxPQUFPTixLQUFLTSxLQUFLOzRCQUNqQkksTUFBTVYsS0FBS1UsSUFBSTs0QkFDZkMsT0FBT1gsS0FBS1csS0FBSzt3QkFDbkI7b0JBQ0YsT0FBTzt3QkFDTFAsYUFBYVEsV0FBVyxHQUFHLElBQUlDO3dCQUMvQlQsYUFBYUksUUFBUSxHQUFHUCxRQUFRUSxpQkFBaUIsRUFBRSx1QkFBdUI7d0JBQzFFLE1BQU1MLGFBQWFVLElBQUk7b0JBQ3pCO29CQUNBLE9BQU87Z0JBQ1QsRUFBRSxPQUFPQyxPQUFPO29CQUNkQyxRQUFRRCxLQUFLLENBQUMseUJBQXlCQTtvQkFDdkMsT0FBTztnQkFDVDtZQUNGO1lBQ0EsT0FBTztRQUNUO1FBQ0EsTUFBTUUsU0FBUSxFQUFFQSxPQUFPLEVBQUU7WUFDdkIsSUFBSUEsUUFBUWpCLElBQUksRUFBRTtnQkFDaEIsTUFBTVosMkRBQVNBO2dCQUNmLE1BQU04QixTQUFTLE1BQU03QiwyREFBSUEsQ0FBQ2dCLE9BQU8sQ0FBQztvQkFBRUMsT0FBT1csUUFBUWpCLElBQUksQ0FBQ00sS0FBSztnQkFBQztnQkFDOUQsSUFBSVksUUFBUTtvQkFDVEQsUUFBUWpCLElBQUksQ0FBdUNtQixFQUFFLEdBQ3BERCxPQUFPRSxHQUFHLENBQUNDLFFBQVE7b0JBQ3BCSixRQUFRakIsSUFBSSxDQUF1Q3NCLFFBQVEsR0FDMURKLE9BQU9JLFFBQVE7Z0JBQ25CO1lBQ0Y7WUFDQSxPQUFPTDtRQUNUO0lBQ0Y7SUFDQUEsU0FBUztRQUNQTSxVQUFVO0lBQ1o7SUFDQUMsT0FBTztRQUNMekIsUUFBUTtJQUNWO0FBQ0YsRUFBRSIsInNvdXJjZXMiOlsid2VicGFjazovL3F1aWNrYWktc2hvcnRzLy4vc3JjL2xpYi9hdXRoL29wdGlvbnMudHM/OTg4MiJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBOZXh0QXV0aE9wdGlvbnMgfSBmcm9tIFwibmV4dC1hdXRoXCI7XHJcbmltcG9ydCBHb29nbGVQcm92aWRlciBmcm9tIFwibmV4dC1hdXRoL3Byb3ZpZGVycy9nb29nbGVcIjtcclxuaW1wb3J0IGNvbm5lY3REQiBmcm9tIFwiQC9saWIvZGIvbW9uZ29kYlwiO1xyXG5pbXBvcnQgVXNlciBmcm9tIFwiQC9saWIvZGIvbW9kZWxzL3VzZXJcIjtcclxuXHJcbmV4cG9ydCBjb25zdCBhdXRoT3B0aW9uczogTmV4dEF1dGhPcHRpb25zID0ge1xyXG4gIHByb3ZpZGVyczogW1xyXG4gICAgR29vZ2xlUHJvdmlkZXIoe1xyXG4gICAgICBjbGllbnRJZDogcHJvY2Vzcy5lbnYuR09PR0xFX0NMSUVOVF9JRCEsXHJcbiAgICAgIGNsaWVudFNlY3JldDogcHJvY2Vzcy5lbnYuR09PR0xFX0NMSUVOVF9TRUNSRVQhLFxyXG4gICAgfSksXHJcbiAgXSxcclxuICBjYWxsYmFja3M6IHtcclxuICAgIGFzeW5jIHNpZ25Jbih7IHVzZXIsIGFjY291bnQsIHByb2ZpbGUgfSkge1xyXG4gICAgICBpZiAoYWNjb3VudD8ucHJvdmlkZXIgPT09IFwiZ29vZ2xlXCIpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgYXdhaXQgY29ubmVjdERCKCk7XHJcbiAgICAgICAgICBjb25zdCBleGlzdGluZ1VzZXIgPSBhd2FpdCBVc2VyLmZpbmRPbmUoeyBlbWFpbDogdXNlci5lbWFpbCB9KTtcclxuXHJcbiAgICAgICAgICBpZiAoIWV4aXN0aW5nVXNlcikge1xyXG4gICAgICAgICAgICBhd2FpdCBVc2VyLmNyZWF0ZSh7XHJcbiAgICAgICAgICAgICAgZ29vZ2xlSWQ6IGFjY291bnQucHJvdmlkZXJBY2NvdW50SWQsXHJcbiAgICAgICAgICAgICAgZW1haWw6IHVzZXIuZW1haWwsXHJcbiAgICAgICAgICAgICAgbmFtZTogdXNlci5uYW1lLFxyXG4gICAgICAgICAgICAgIGltYWdlOiB1c2VyLmltYWdlLFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGV4aXN0aW5nVXNlci5sYXN0TG9naW5BdCA9IG5ldyBEYXRlKCk7XHJcbiAgICAgICAgICAgIGV4aXN0aW5nVXNlci5nb29nbGVJZCA9IGFjY291bnQucHJvdmlkZXJBY2NvdW50SWQ7IC8vIEVuc3VyZSBJRCBpcyB1cGRhdGVkXHJcbiAgICAgICAgICAgIGF3YWl0IGV4aXN0aW5nVXNlci5zYXZlKCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yIGR1cmluZyBzaWduIGluOlwiLCBlcnJvcik7XHJcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfSxcclxuICAgIGFzeW5jIHNlc3Npb24oeyBzZXNzaW9uIH0pIHtcclxuICAgICAgaWYgKHNlc3Npb24udXNlcikge1xyXG4gICAgICAgIGF3YWl0IGNvbm5lY3REQigpO1xyXG4gICAgICAgIGNvbnN0IGRiVXNlciA9IGF3YWl0IFVzZXIuZmluZE9uZSh7IGVtYWlsOiBzZXNzaW9uLnVzZXIuZW1haWwgfSk7XHJcbiAgICAgICAgaWYgKGRiVXNlcikge1xyXG4gICAgICAgICAgKHNlc3Npb24udXNlciBhcyB7IGlkOiBzdHJpbmc7IHNldHRpbmdzOiB1bmtub3duIH0pLmlkID1cclxuICAgICAgICAgICAgZGJVc2VyLl9pZC50b1N0cmluZygpO1xyXG4gICAgICAgICAgKHNlc3Npb24udXNlciBhcyB7IGlkOiBzdHJpbmc7IHNldHRpbmdzOiB1bmtub3duIH0pLnNldHRpbmdzID1cclxuICAgICAgICAgICAgZGJVc2VyLnNldHRpbmdzO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gc2Vzc2lvbjtcclxuICAgIH0sXHJcbiAgfSxcclxuICBzZXNzaW9uOiB7XHJcbiAgICBzdHJhdGVneTogXCJqd3RcIixcclxuICB9LFxyXG4gIHBhZ2VzOiB7XHJcbiAgICBzaWduSW46IFwiL3NpZ25pblwiLFxyXG4gIH0sXHJcbn07XHJcbiJdLCJuYW1lcyI6WyJHb29nbGVQcm92aWRlciIsImNvbm5lY3REQiIsIlVzZXIiLCJhdXRoT3B0aW9ucyIsInByb3ZpZGVycyIsImNsaWVudElkIiwicHJvY2VzcyIsImVudiIsIkdPT0dMRV9DTElFTlRfSUQiLCJjbGllbnRTZWNyZXQiLCJHT09HTEVfQ0xJRU5UX1NFQ1JFVCIsImNhbGxiYWNrcyIsInNpZ25JbiIsInVzZXIiLCJhY2NvdW50IiwicHJvZmlsZSIsInByb3ZpZGVyIiwiZXhpc3RpbmdVc2VyIiwiZmluZE9uZSIsImVtYWlsIiwiY3JlYXRlIiwiZ29vZ2xlSWQiLCJwcm92aWRlckFjY291bnRJZCIsIm5hbWUiLCJpbWFnZSIsImxhc3RMb2dpbkF0IiwiRGF0ZSIsInNhdmUiLCJlcnJvciIsImNvbnNvbGUiLCJzZXNzaW9uIiwiZGJVc2VyIiwiaWQiLCJfaWQiLCJ0b1N0cmluZyIsInNldHRpbmdzIiwic3RyYXRlZ3kiLCJwYWdlcyJdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./src/lib/auth/options.ts\n");

/***/ }),

/***/ "(rsc)/./src/lib/db/models/user.ts":
/*!***********************************!*\
  !*** ./src/lib/db/models/user.ts ***!
  \***********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (__WEBPACK_DEFAULT_EXPORT__)\n/* harmony export */ });\n/* harmony import */ var mongoose__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! mongoose */ \"mongoose\");\n/* harmony import */ var mongoose__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(mongoose__WEBPACK_IMPORTED_MODULE_0__);\n\nconst UserSchema = new mongoose__WEBPACK_IMPORTED_MODULE_0__.Schema({\n    googleId: {\n        type: String,\n        unique: true,\n        sparse: true\n    },\n    email: {\n        type: String,\n        required: true,\n        unique: true\n    },\n    name: {\n        type: String,\n        required: true\n    },\n    image: {\n        type: String\n    },\n    createdAt: {\n        type: Date,\n        default: Date.now\n    },\n    updatedAt: {\n        type: Date,\n        default: Date.now\n    },\n    lastLoginAt: {\n        type: Date,\n        default: Date.now\n    },\n    settings: {\n        theme: {\n            type: String,\n            enum: [\n                \"light\",\n                \"dark\",\n                \"system\"\n            ],\n            default: \"system\"\n        },\n        defaultAspectRatio: {\n            type: String,\n            enum: [\n                \"9:16\",\n                \"1:1\"\n            ],\n            default: \"9:16\"\n        },\n        defaultQuality: {\n            type: String,\n            enum: [\n                \"low\",\n                \"medium\",\n                \"high\"\n            ],\n            default: \"medium\"\n        },\n        captionPreset: {\n            type: String,\n            default: \"default\"\n        },\n        whisperModel: {\n            type: String,\n            enum: [\n                \"tiny\",\n                \"base\",\n                \"small\"\n            ],\n            default: \"base\"\n        }\n    },\n    stats: {\n        totalProjects: {\n            type: Number,\n            default: 0\n        },\n        totalExports: {\n            type: Number,\n            default: 0\n        },\n        totalProcessingTimeMs: {\n            type: Number,\n            default: 0\n        }\n    }\n});\nconst User = mongoose__WEBPACK_IMPORTED_MODULE_0__.models.User || (0,mongoose__WEBPACK_IMPORTED_MODULE_0__.model)(\"User\", UserSchema);\n/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (User);\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvbGliL2RiL21vZGVscy91c2VyLnRzIiwibWFwcGluZ3MiOiI7Ozs7OztBQUFpRDtBQUVqRCxNQUFNRyxhQUFhLElBQUlILDRDQUFNQSxDQUFDO0lBQzVCSSxVQUFVO1FBQUVDLE1BQU1DO1FBQVFDLFFBQVE7UUFBTUMsUUFBUTtJQUFLO0lBQ3JEQyxPQUFPO1FBQUVKLE1BQU1DO1FBQVFJLFVBQVU7UUFBTUgsUUFBUTtJQUFLO0lBQ3BESSxNQUFNO1FBQUVOLE1BQU1DO1FBQVFJLFVBQVU7SUFBSztJQUNyQ0UsT0FBTztRQUFFUCxNQUFNQztJQUFPO0lBQ3RCTyxXQUFXO1FBQUVSLE1BQU1TO1FBQU1DLFNBQVNELEtBQUtFLEdBQUc7SUFBQztJQUMzQ0MsV0FBVztRQUFFWixNQUFNUztRQUFNQyxTQUFTRCxLQUFLRSxHQUFHO0lBQUM7SUFDM0NFLGFBQWE7UUFBRWIsTUFBTVM7UUFBTUMsU0FBU0QsS0FBS0UsR0FBRztJQUFDO0lBQzdDRyxVQUFVO1FBQ1JDLE9BQU87WUFDTGYsTUFBTUM7WUFDTmUsTUFBTTtnQkFBQztnQkFBUztnQkFBUTthQUFTO1lBQ2pDTixTQUFTO1FBQ1g7UUFDQU8sb0JBQW9CO1lBQ2xCakIsTUFBTUM7WUFDTmUsTUFBTTtnQkFBQztnQkFBUTthQUFNO1lBQ3JCTixTQUFTO1FBQ1g7UUFDQVEsZ0JBQWdCO1lBQ2RsQixNQUFNQztZQUNOZSxNQUFNO2dCQUFDO2dCQUFPO2dCQUFVO2FBQU87WUFDL0JOLFNBQVM7UUFDWDtRQUNBUyxlQUFlO1lBQUVuQixNQUFNQztZQUFRUyxTQUFTO1FBQVU7UUFDbERVLGNBQWM7WUFDWnBCLE1BQU1DO1lBQ05lLE1BQU07Z0JBQUM7Z0JBQVE7Z0JBQVE7YUFBUTtZQUMvQk4sU0FBUztRQUNYO0lBQ0Y7SUFDQVcsT0FBTztRQUNMQyxlQUFlO1lBQUV0QixNQUFNdUI7WUFBUWIsU0FBUztRQUFFO1FBQzFDYyxjQUFjO1lBQUV4QixNQUFNdUI7WUFBUWIsU0FBUztRQUFFO1FBQ3pDZSx1QkFBdUI7WUFBRXpCLE1BQU11QjtZQUFRYixTQUFTO1FBQUU7SUFDcEQ7QUFDRjtBQUVBLE1BQU1nQixPQUFPN0IsNENBQU1BLENBQUM2QixJQUFJLElBQUk5QiwrQ0FBS0EsQ0FBQyxRQUFRRTtBQUMxQyxpRUFBZTRCLElBQUlBLEVBQUMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9xdWlja2FpLXNob3J0cy8uL3NyYy9saWIvZGIvbW9kZWxzL3VzZXIudHM/NGU1MyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTY2hlbWEsIG1vZGVsLCBtb2RlbHMgfSBmcm9tIFwibW9uZ29vc2VcIjtcclxuXHJcbmNvbnN0IFVzZXJTY2hlbWEgPSBuZXcgU2NoZW1hKHtcclxuICBnb29nbGVJZDogeyB0eXBlOiBTdHJpbmcsIHVuaXF1ZTogdHJ1ZSwgc3BhcnNlOiB0cnVlIH0sXHJcbiAgZW1haWw6IHsgdHlwZTogU3RyaW5nLCByZXF1aXJlZDogdHJ1ZSwgdW5pcXVlOiB0cnVlIH0sXHJcbiAgbmFtZTogeyB0eXBlOiBTdHJpbmcsIHJlcXVpcmVkOiB0cnVlIH0sXHJcbiAgaW1hZ2U6IHsgdHlwZTogU3RyaW5nIH0sXHJcbiAgY3JlYXRlZEF0OiB7IHR5cGU6IERhdGUsIGRlZmF1bHQ6IERhdGUubm93IH0sXHJcbiAgdXBkYXRlZEF0OiB7IHR5cGU6IERhdGUsIGRlZmF1bHQ6IERhdGUubm93IH0sXHJcbiAgbGFzdExvZ2luQXQ6IHsgdHlwZTogRGF0ZSwgZGVmYXVsdDogRGF0ZS5ub3cgfSxcclxuICBzZXR0aW5nczoge1xyXG4gICAgdGhlbWU6IHtcclxuICAgICAgdHlwZTogU3RyaW5nLFxyXG4gICAgICBlbnVtOiBbXCJsaWdodFwiLCBcImRhcmtcIiwgXCJzeXN0ZW1cIl0sXHJcbiAgICAgIGRlZmF1bHQ6IFwic3lzdGVtXCIsXHJcbiAgICB9LFxyXG4gICAgZGVmYXVsdEFzcGVjdFJhdGlvOiB7XHJcbiAgICAgIHR5cGU6IFN0cmluZyxcclxuICAgICAgZW51bTogW1wiOToxNlwiLCBcIjE6MVwiXSxcclxuICAgICAgZGVmYXVsdDogXCI5OjE2XCIsXHJcbiAgICB9LFxyXG4gICAgZGVmYXVsdFF1YWxpdHk6IHtcclxuICAgICAgdHlwZTogU3RyaW5nLFxyXG4gICAgICBlbnVtOiBbXCJsb3dcIiwgXCJtZWRpdW1cIiwgXCJoaWdoXCJdLFxyXG4gICAgICBkZWZhdWx0OiBcIm1lZGl1bVwiLFxyXG4gICAgfSxcclxuICAgIGNhcHRpb25QcmVzZXQ6IHsgdHlwZTogU3RyaW5nLCBkZWZhdWx0OiBcImRlZmF1bHRcIiB9LFxyXG4gICAgd2hpc3Blck1vZGVsOiB7XHJcbiAgICAgIHR5cGU6IFN0cmluZyxcclxuICAgICAgZW51bTogW1widGlueVwiLCBcImJhc2VcIiwgXCJzbWFsbFwiXSxcclxuICAgICAgZGVmYXVsdDogXCJiYXNlXCIsXHJcbiAgICB9LFxyXG4gIH0sXHJcbiAgc3RhdHM6IHtcclxuICAgIHRvdGFsUHJvamVjdHM6IHsgdHlwZTogTnVtYmVyLCBkZWZhdWx0OiAwIH0sXHJcbiAgICB0b3RhbEV4cG9ydHM6IHsgdHlwZTogTnVtYmVyLCBkZWZhdWx0OiAwIH0sXHJcbiAgICB0b3RhbFByb2Nlc3NpbmdUaW1lTXM6IHsgdHlwZTogTnVtYmVyLCBkZWZhdWx0OiAwIH0sXHJcbiAgfSxcclxufSk7XHJcblxyXG5jb25zdCBVc2VyID0gbW9kZWxzLlVzZXIgfHwgbW9kZWwoXCJVc2VyXCIsIFVzZXJTY2hlbWEpO1xyXG5leHBvcnQgZGVmYXVsdCBVc2VyO1xyXG4iXSwibmFtZXMiOlsiU2NoZW1hIiwibW9kZWwiLCJtb2RlbHMiLCJVc2VyU2NoZW1hIiwiZ29vZ2xlSWQiLCJ0eXBlIiwiU3RyaW5nIiwidW5pcXVlIiwic3BhcnNlIiwiZW1haWwiLCJyZXF1aXJlZCIsIm5hbWUiLCJpbWFnZSIsImNyZWF0ZWRBdCIsIkRhdGUiLCJkZWZhdWx0Iiwibm93IiwidXBkYXRlZEF0IiwibGFzdExvZ2luQXQiLCJzZXR0aW5ncyIsInRoZW1lIiwiZW51bSIsImRlZmF1bHRBc3BlY3RSYXRpbyIsImRlZmF1bHRRdWFsaXR5IiwiY2FwdGlvblByZXNldCIsIndoaXNwZXJNb2RlbCIsInN0YXRzIiwidG90YWxQcm9qZWN0cyIsIk51bWJlciIsInRvdGFsRXhwb3J0cyIsInRvdGFsUHJvY2Vzc2luZ1RpbWVNcyIsIlVzZXIiXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./src/lib/db/models/user.ts\n");

/***/ }),

/***/ "(rsc)/./src/lib/db/mongodb.ts":
/*!*******************************!*\
  !*** ./src/lib/db/mongodb.ts ***!
  \*******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (__WEBPACK_DEFAULT_EXPORT__)\n/* harmony export */ });\n/* harmony import */ var mongoose__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! mongoose */ \"mongoose\");\n/* harmony import */ var mongoose__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(mongoose__WEBPACK_IMPORTED_MODULE_0__);\n\nconst MONGODB_URI = process.env.MONGODB_URI;\nif (!MONGODB_URI && \"development\" !== \"production\") {\n    console.warn(\"Warning: MONGODB_URI environment variable is not defined. Database operations will fail.\");\n}\nif (!global.mongoose) {\n    global.mongoose = {\n        conn: null,\n        promise: null\n    };\n}\nconst cached = global.mongoose;\nasync function connectDB() {\n    if (!MONGODB_URI) {\n        throw new Error(\"MONGODB_URI is not defined\");\n    }\n    if (cached.conn) {\n        return cached.conn;\n    }\n    if (!cached.promise) {\n        const opts = {\n            bufferCommands: false\n        };\n        cached.promise = mongoose__WEBPACK_IMPORTED_MODULE_0___default().connect(MONGODB_URI, opts).then((mongoose)=>{\n            return mongoose;\n        });\n    }\n    try {\n        cached.conn = await cached.promise;\n    } catch (e) {\n        cached.promise = null;\n        throw e;\n    }\n    return cached.conn;\n}\n/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (connectDB);\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvbGliL2RiL21vbmdvZGIudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQWdDO0FBRWhDLE1BQU1DLGNBQWNDLFFBQVFDLEdBQUcsQ0FBQ0YsV0FBVztBQUUzQyxJQUFJLENBQUNBLGVBQWVDLGtCQUF5QixjQUFjO0lBQ3pERSxRQUFRQyxJQUFJLENBQ1Y7QUFFSjtBQWlCQSxJQUFJLENBQUNDLE9BQU9OLFFBQVEsRUFBRTtJQUNwQk0sT0FBT04sUUFBUSxHQUFHO1FBQUVPLE1BQU07UUFBTUMsU0FBUztJQUFLO0FBQ2hEO0FBRUEsTUFBTUMsU0FBU0gsT0FBT04sUUFBUTtBQUU5QixlQUFlVTtJQUNiLElBQUksQ0FBQ1QsYUFBYTtRQUNoQixNQUFNLElBQUlVLE1BQU07SUFDbEI7SUFFQSxJQUFJRixPQUFPRixJQUFJLEVBQUU7UUFDZixPQUFPRSxPQUFPRixJQUFJO0lBQ3BCO0lBRUEsSUFBSSxDQUFDRSxPQUFPRCxPQUFPLEVBQUU7UUFDbkIsTUFBTUksT0FBTztZQUNYQyxnQkFBZ0I7UUFDbEI7UUFFQUosT0FBT0QsT0FBTyxHQUFHUix1REFBZ0IsQ0FBQ0MsYUFBYVcsTUFBTUcsSUFBSSxDQUFDLENBQUNmO1lBQ3pELE9BQU9BO1FBQ1Q7SUFDRjtJQUVBLElBQUk7UUFDRlMsT0FBT0YsSUFBSSxHQUFHLE1BQU1FLE9BQU9ELE9BQU87SUFDcEMsRUFBRSxPQUFPUSxHQUFHO1FBQ1ZQLE9BQU9ELE9BQU8sR0FBRztRQUNqQixNQUFNUTtJQUNSO0lBRUEsT0FBT1AsT0FBT0YsSUFBSTtBQUNwQjtBQUVBLGlFQUFlRyxTQUFTQSxFQUFDIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vcXVpY2thaS1zaG9ydHMvLi9zcmMvbGliL2RiL21vbmdvZGIudHM/MzBhNSJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgbW9uZ29vc2UgZnJvbSBcIm1vbmdvb3NlXCI7XHJcblxyXG5jb25zdCBNT05HT0RCX1VSSSA9IHByb2Nlc3MuZW52Lk1PTkdPREJfVVJJO1xyXG5cclxuaWYgKCFNT05HT0RCX1VSSSAmJiBwcm9jZXNzLmVudi5OT0RFX0VOViAhPT0gXCJwcm9kdWN0aW9uXCIpIHtcclxuICBjb25zb2xlLndhcm4oXHJcbiAgICBcIldhcm5pbmc6IE1PTkdPREJfVVJJIGVudmlyb25tZW50IHZhcmlhYmxlIGlzIG5vdCBkZWZpbmVkLiBEYXRhYmFzZSBvcGVyYXRpb25zIHdpbGwgZmFpbC5cIixcclxuICApO1xyXG59XHJcblxyXG4vKipcclxuICogR2xvYmFsIGlzIHVzZWQgaGVyZSB0byBtYWludGFpbiBhIGNhY2hlZCBjb25uZWN0aW9uIGFjcm9zcyBob3QgcmVsb2Fkc1xyXG4gKiBpbiBkZXZlbG9wbWVudC4gVGhpcyBwcmV2ZW50cyBjb25uZWN0aW9ucyBncm93aW5nIGV4cG9uZW50aWFsbHlcclxuICogZHVyaW5nIEFQSSBSb3V0ZSB1c2FnZS5cclxuICovXHJcbmRlY2xhcmUgZ2xvYmFsIHtcclxuICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tdmFyXHJcbiAgdmFyIG1vbmdvb3NlOlxyXG4gICAgfCB7XHJcbiAgICAgICAgY29ubjogbW9uZ29vc2UuTW9uZ29vc2UgfCBudWxsO1xyXG4gICAgICAgIHByb21pc2U6IFByb21pc2U8bW9uZ29vc2UuTW9uZ29vc2U+IHwgbnVsbDtcclxuICAgICAgfVxyXG4gICAgfCB1bmRlZmluZWQ7XHJcbn1cclxuXHJcbmlmICghZ2xvYmFsLm1vbmdvb3NlKSB7XHJcbiAgZ2xvYmFsLm1vbmdvb3NlID0geyBjb25uOiBudWxsLCBwcm9taXNlOiBudWxsIH07XHJcbn1cclxuXHJcbmNvbnN0IGNhY2hlZCA9IGdsb2JhbC5tb25nb29zZTtcclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGNvbm5lY3REQigpIHtcclxuICBpZiAoIU1PTkdPREJfVVJJKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJNT05HT0RCX1VSSSBpcyBub3QgZGVmaW5lZFwiKTtcclxuICB9XHJcblxyXG4gIGlmIChjYWNoZWQuY29ubikge1xyXG4gICAgcmV0dXJuIGNhY2hlZC5jb25uO1xyXG4gIH1cclxuXHJcbiAgaWYgKCFjYWNoZWQucHJvbWlzZSkge1xyXG4gICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgYnVmZmVyQ29tbWFuZHM6IGZhbHNlLFxyXG4gICAgfTtcclxuXHJcbiAgICBjYWNoZWQucHJvbWlzZSA9IG1vbmdvb3NlLmNvbm5lY3QoTU9OR09EQl9VUkksIG9wdHMpLnRoZW4oKG1vbmdvb3NlKSA9PiB7XHJcbiAgICAgIHJldHVybiBtb25nb29zZTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgdHJ5IHtcclxuICAgIGNhY2hlZC5jb25uID0gYXdhaXQgY2FjaGVkLnByb21pc2U7XHJcbiAgfSBjYXRjaCAoZSkge1xyXG4gICAgY2FjaGVkLnByb21pc2UgPSBudWxsO1xyXG4gICAgdGhyb3cgZTtcclxuICB9XHJcblxyXG4gIHJldHVybiBjYWNoZWQuY29ubjtcclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgY29ubmVjdERCO1xyXG4iXSwibmFtZXMiOlsibW9uZ29vc2UiLCJNT05HT0RCX1VSSSIsInByb2Nlc3MiLCJlbnYiLCJjb25zb2xlIiwid2FybiIsImdsb2JhbCIsImNvbm4iLCJwcm9taXNlIiwiY2FjaGVkIiwiY29ubmVjdERCIiwiRXJyb3IiLCJvcHRzIiwiYnVmZmVyQ29tbWFuZHMiLCJjb25uZWN0IiwidGhlbiIsImUiXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./src/lib/db/mongodb.ts\n");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../../../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/next-auth","vendor-chunks/@babel","vendor-chunks/jose","vendor-chunks/openid-client","vendor-chunks/uuid","vendor-chunks/oauth","vendor-chunks/@panva","vendor-chunks/preact-render-to-string","vendor-chunks/preact","vendor-chunks/oidc-token-hash","vendor-chunks/object-hash","vendor-chunks/cookie"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fauth%2F%5B...nextauth%5D%2Froute&page=%2Fapi%2Fauth%2F%5B...nextauth%5D%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2F%5B...nextauth%5D%2Froute.ts&appDir=E%3A%5CQuickAI%20Short%20orignal%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=E%3A%5CQuickAI%20Short%20orignal&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();